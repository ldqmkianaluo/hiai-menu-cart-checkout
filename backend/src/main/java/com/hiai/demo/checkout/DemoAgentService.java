package com.hiai.demo.checkout;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 点餐助手：配置了 AI_API_KEY（环境变量）就走 DeepSeek 生成，否则退回本地规则引擎。
 * 无论走哪条路径，价格与合计都由服务端按菜单重算，绝不采用模型给的钱数。
 */
@Service
class DemoAgentService {
    private static final String RULE_DISCLAIMER = "规则推荐 · 离线演示，未调用大模型";
    private static final String AI_DISCLAIMER = "DeepSeek 在线生成 · 价格与合计由后端重算，不会采用模型给的钱数";
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    private static final String AI_SYSTEM_PROMPT = String.join("\n",
            "你是「朱家大院」这家餐厅的点餐服务员，只做一件事：根据客人的需求推荐菜品，并给出简短理由。",
            "",
            "菜单（只能从这里选）：",
            "dish-001 院子红烧肉 ¥38 招牌 荤菜",
            "dish-002 砂锅鲜鱼头 ¥58 人气 鱼 微辣",
            "dish-003 小炒黄牛肉 ¥42 辣 下饭",
            "dish-004 清炒时蔬 ¥18 清爽少油",
            "dish-005 农家炒饭 ¥16 主食",
            "dish-006 手工汤面 ¥20 主食 带汤",
            "dish-007 桂花酸梅汤 ¥9 饮品 解辣",
            "dish-008 山泉乌龙茶 ¥8 饮品 无糖",
            "",
            "规则：",
            "1. 只输出 JSON，不要 markdown 代码块，不要解释；",
            "2. 结构：{\"reply\":\"给客人看的一句话\",\"people\":人数,\"items\":[{\"dishId\":\"dish-001\",\"quantity\":2,\"reason\":\"不超过 20 字的理由\"}]}",
            "3. items 1–6 项，quantity 1–9，必须包含足够吃饱的主食，荤素搭配；",
            "4. 客人给了预算时，总价必须不超过预算，超了就少点菜；",
            "5. reply 用中文口语，不超过 60 字，不要提模型、不要提规则；",
            "6. reply 里不要出现金额数字，也不要承诺折扣、优惠、免单。");

    record Suggestion(String dishId, String name, BigDecimal price, int quantity, BigDecimal lineTotal,
                      String reason, String artColor) {}

    record ChatMessage(String role, String content) {}

    record ChatReply(String engine, String reply, List<Suggestion> items, int partySize, int budget,
                     BigDecimal total, boolean withinBudget, String disclaimer, String note) {}

    private record Pick(DemoCatalog.Dish dish, int quantity, String reason) {}

    // ---------- 对话入口 ----------

    ChatReply chat(List<ChatMessage> messages, int partySize, int budget) {
        List<ChatMessage> history = sanitize(messages);
        String lastUser = lastUserText(history);
        String key = System.getenv("AI_API_KEY");
        if (key == null || key.isBlank()) {
            return rulesReply(lastUser, Math.max(0, budget), null);
        }
        try {
            JsonNode payload = callDeepSeek(key, history);
            return buildAiReply(payload, Math.max(0, budget));
        } catch (Exception error) {
            String note = "AI 调用失败，已退回规则推荐：" + shorten(error.getMessage(), 60);
            return rulesReply(lastUser, Math.max(0, budget), note);
        }
    }

    private ChatReply rulesReply(String demand, int budget, String note) {
        int party = 2;
        String partyHit = demand.replaceAll(".*?([一两二三四五六七八九十0-9]+)\\s*[个]?人.*", "$1");
        if (!partyHit.equals(demand)) {
            Integer parsed = chineseNumber(partyHit);
            if (parsed != null) {
                party = parsed;
            }
        }
        List<Pick> picks = buildPicks(demand, Math.min(12, Math.max(1, party)), budget);
        List<Suggestion> items = toSuggestions(picks);
        BigDecimal total = totalOf(picks);
        String reply = describe(picks, party, budget, total, demand);
        return new ChatReply("rules", reply, items, party, budget, total,
                budget == 0 || total.compareTo(BigDecimal.valueOf(budget)) <= 0, RULE_DISCLAIMER, note);
    }

    private ChatReply buildAiReply(JsonNode payload, int budget) {
        List<Suggestion> items = new ArrayList<>();
        JsonNode rawItems = payload.path("items");
        for (JsonNode raw : rawItems) {
            String dishId = raw.path("dishId").asText("");
            DemoCatalog.Dish dish = DemoCatalog.DISH_BY_ID.get(dishId);
            if (dish == null) {
                continue;
            }
            boolean duplicated = items.stream().anyMatch(item -> item.dishId().equals(dishId));
            if (duplicated) {
                continue;
            }
            int quantity = Math.min(9, Math.max(1, raw.path("quantity").asInt(1)));
            String reason = shorten(raw.path("reason").asText(""), 40);
            if (reason.isBlank()) {
                reason = "按你的口味挑的";
            }
            items.add(new Suggestion(dish.id(), dish.name(), dish.price(), quantity,
                    dish.price().multiply(BigDecimal.valueOf(quantity)), reason, dish.artColor()));
            if (items.size() >= 6) {
                break;
            }
        }
        if (items.isEmpty()) {
            throw new IllegalStateException("AI 没有给出可用菜品");
        }
        items = trimToBudget(items, budget);
        BigDecimal total = BigDecimal.ZERO;
        for (Suggestion item : items) {
            total = total.add(item.lineTotal());
        }
        String reply = shorten(payload.path("reply").asText(""), 120);
        if (reply.isBlank()) {
            reply = "按你的需求配了这几样。";
        }
        return new ChatReply("llm", reply, items, 2, budget, total,
                budget == 0 || total.compareTo(BigDecimal.valueOf(budget)) <= 0, AI_DISCLAIMER, null);
    }

    private List<Suggestion> trimToBudget(List<Suggestion> items, int budget) {
        if (budget <= 0) {
            return items;
        }
        List<Suggestion> work = new ArrayList<>(items);
        int guard = 0;
        while (totalOfSuggestions(work).compareTo(BigDecimal.valueOf(budget)) > 0 && work.size() > 1 && guard < 8) {
            int drinkIndex = -1;
            for (int i = 0; i < work.size(); i++) {
                String id = work.get(i).dishId();
                if ("dish-007".equals(id) || "dish-008".equals(id)) {
                    drinkIndex = i;
                    break;
                }
            }
            if (drinkIndex >= 0) {
                work.remove(drinkIndex);
            } else {
                int biggest = 0;
                for (int i = 1; i < work.size(); i++) {
                    if (work.get(i).lineTotal().compareTo(work.get(biggest).lineTotal()) > 0) {
                        biggest = i;
                    }
                }
                Suggestion item = work.get(biggest);
                if (item.quantity() > 1) {
                    work.set(biggest, new Suggestion(item.dishId(), item.name(), item.price(), item.quantity() - 1,
                            item.price().multiply(BigDecimal.valueOf(item.quantity() - 1L)), item.reason(),
                            item.artColor()));
                } else {
                    work.remove(biggest);
                }
            }
            guard++;
        }
        return work;
    }

    private static BigDecimal totalOfSuggestions(List<Suggestion> items) {
        BigDecimal total = BigDecimal.ZERO;
        for (Suggestion item : items) {
            total = total.add(item.lineTotal());
        }
        return total;
    }

    private JsonNode callDeepSeek(String key, List<ChatMessage> history) throws Exception {
        List<Map<String, String>> payloadMessages = new ArrayList<>();
        payloadMessages.add(Map.of("role", "system", "content", AI_SYSTEM_PROMPT));
        for (ChatMessage message : history) {
            payloadMessages.add(Map.of("role", message.role(), "content", message.content()));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", env("AI_MODEL", "deepseek-chat"));
        body.put("messages", payloadMessages);
        body.put("temperature", 0.6);
        body.put("max_tokens", 700);
        body.put("response_format", Map.of("type", "json_object"));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(env("AI_ENDPOINT", "https://api.deepseek.com/chat/completions")))
                .timeout(Duration.ofSeconds(25))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + key)
                .POST(HttpRequest.BodyPublishers.ofString(MAPPER.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() / 100 != 2) {
            throw new IllegalStateException("DeepSeek " + response.statusCode());
        }
        JsonNode root = MAPPER.readTree(response.body());
        String content = root.path("choices").path(0).path("message").path("content").asText("");
        int start = content.indexOf('{');
        int end = content.lastIndexOf('}');
        if (start < 0 || end <= start) {
            throw new IllegalStateException("AI 返回的不是 JSON");
        }
        return MAPPER.readTree(content.substring(start, end + 1));
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private static List<ChatMessage> sanitize(List<ChatMessage> messages) {
        List<ChatMessage> history = new ArrayList<>();
        if (messages == null) {
            return history;
        }
        for (ChatMessage message : messages) {
            if (message == null || message.content() == null) {
                continue;
            }
            String role = message.role();
            if (!"user".equals(role) && !"assistant".equals(role)) {
                continue;
            }
            history.add(new ChatMessage(role, shorten(message.content(), 300)));
        }
        if (history.size() > 8) {
            return new ArrayList<>(history.subList(history.size() - 8, history.size()));
        }
        return history;
    }

    private static String lastUserText(List<ChatMessage> history) {
        for (int i = history.size() - 1; i >= 0; i--) {
            if ("user".equals(history.get(i).role())) {
                return history.get(i).content();
            }
        }
        return "";
    }

    private static String shorten(String text, int limit) {
        if (text == null) {
            return "";
        }
        String trimmed = text.trim();
        return trimmed.length() <= limit ? trimmed : trimmed.substring(0, limit);
    }

    private List<Pick> buildPicks(String demand, int party, int budget) {
        String text = demand == null ? "" : demand.trim();
        boolean spicy = contains(text, "辣", "重口", "川", "湘", "下饭");
        boolean light = contains(text, "清淡", "不辣", "少油", "养生", "老人");
        boolean soup = contains(text, "汤", "面", "暖");
        boolean wantsDrink = contains(text, "饮料", "喝的", "茶", "饮", "解辣", "解腻");
        boolean fish = contains(text, "鱼");
        boolean beef = contains(text, "牛肉", "牛");

        DemoCatalog.Dish main = fish ? dish("dish-002") : (beef || spicy ? dish("dish-003") : dish("dish-001"));
        DemoCatalog.Dish veg = dish("dish-004");
        DemoCatalog.Dish staple = soup ? dish("dish-006") : dish("dish-005");
        DemoCatalog.Dish drink = (spicy || wantsDrink) ? dish(spicy ? "dish-007" : "dish-008") : null;

        List<Pick> picks = new ArrayList<>();
        picks.add(new Pick(main, Math.min(3, Math.max(1, (party + 1) / 2)),
                spicy ? "你提到想辣、想下饭，这道最扛饭"
                        : fish ? "你点名要吃鱼，这锅鱼头适合分着吃"
                        : "荤菜里最稳的一道，第一次来基本都会点"));
        picks.add(new Pick(veg, party >= 4 ? 2 : 1,
                light ? "你要清淡，这道少油现炒，正好平衡" : "一荤一素才像正经吃饭，解腻"));
        picks.add(new Pick(staple, party, soup ? "想喝汤就配汤面，比炒饭合适" : "按人数配主食，先保证吃饱"));
        if (drink != null) {
            picks.add(new Pick(drink, Math.max(1, (party + 1) / 2), spicy ? "辣味配酸甜冰饮，解辣最快" : "无糖茶饮，不占预算"));
        }

        if (budget > 0) {
            int guard = 0;
            while (totalOf(picks).compareTo(BigDecimal.valueOf(budget)) > 0 && picks.size() > 1 && guard < 8) {
                int drinkIndex = -1;
                for (int i = 0; i < picks.size(); i++) {
                    if ("drink".equals(picks.get(i).dish().categoryId())) {
                        drinkIndex = i;
                        break;
                    }
                }
                if (drinkIndex >= 0) {
                    picks.remove(drinkIndex);
                } else {
                    int biggest = 0;
                    BigDecimal biggestLine = BigDecimal.ZERO;
                    for (int i = 0; i < picks.size(); i++) {
                        Pick pick = picks.get(i);
                        BigDecimal line = pick.dish().price().multiply(BigDecimal.valueOf(pick.quantity()));
                        if (line.compareTo(biggestLine) > 0) {
                            biggestLine = line;
                            biggest = i;
                        }
                    }
                    Pick pick = picks.get(biggest);
                    if (pick.quantity() > 1) {
                        picks.set(biggest, new Pick(pick.dish(), pick.quantity() - 1, pick.reason()));
                    } else {
                        picks.remove(biggest);
                    }
                }
                guard++;
            }
        }
        return picks;
    }

    private static String describe(List<Pick> picks, int party, int budget, BigDecimal total, String demand) {
        StringBuilder items = new StringBuilder();
        for (Pick pick : picks) {
            if (items.length() > 0) {
                items.append("、");
            }
            items.append(pick.dish().name()).append("×").append(pick.quantity());
        }
        StringBuilder reply = new StringBuilder();
        reply.append(party).append(" 个人");
        if (budget > 0) {
            reply.append("、预算 ¥").append(budget);
        }
        reply.append("：给你配了 ").append(items).append("。");
        if (budget > 0 && total.compareTo(BigDecimal.valueOf(budget)) > 0) {
            reply.append("已经尽量压了，还是超一点。");
        }
        if (contains(demand, "辣") && contains(demand, "清淡")) {
            reply.append(" 辣和清淡都提了，我按辣优先，素菜来平衡。");
        }
        return reply.toString();
    }

    private static List<Suggestion> toSuggestions(List<Pick> picks) {
        List<Suggestion> items = new ArrayList<>();
        for (Pick pick : picks) {
            items.add(new Suggestion(pick.dish().id(), pick.dish().name(), pick.dish().price(), pick.quantity(),
                    pick.dish().price().multiply(BigDecimal.valueOf(pick.quantity())), pick.reason(),
                    pick.dish().artColor()));
        }
        return items;
    }

    private static Integer chineseNumber(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        if (raw.chars().allMatch(Character::isDigit)) {
            return Integer.parseInt(raw);
        }
        String digits = "一二三四五六七八九十";
        if (raw.length() == 1) {
            int index = digits.indexOf(raw);
            return index < 0 ? null : index + 1;
        }
        if (raw.length() == 2 && raw.charAt(0) == '十') {
            int index = digits.indexOf(raw.charAt(1));
            return index < 0 ? null : 10 + index + 1;
        }
        return null;
    }

    // ---------- 规则版一次性推荐（保留 /agent/recommend）----------

    record Recommendation(String reply, List<Suggestion> items, int partySize, int budget, BigDecimal total,
                          boolean withinBudget, String disclaimer) {}

    Recommendation recommend(String demand, int partySize, int budget) {
        int party = Math.min(12, Math.max(1, partySize <= 0 ? 2 : partySize));
        int safeBudget = Math.max(0, budget);
        List<Pick> picks = buildPicks(demand, party, safeBudget);
        BigDecimal total = totalOf(picks);
        boolean withinBudget = safeBudget == 0 || total.compareTo(BigDecimal.valueOf(safeBudget)) <= 0;
        return new Recommendation(describe(picks, party, safeBudget, total, demand), toSuggestions(picks), party,
                safeBudget, total, withinBudget, RULE_DISCLAIMER);
    }

    private static BigDecimal totalOf(List<Pick> picks) {
        BigDecimal total = BigDecimal.ZERO;
        for (Pick pick : picks) {
            total = total.add(pick.dish().price().multiply(BigDecimal.valueOf(pick.quantity())));
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    private static boolean contains(String text, String... keywords) {
        for (String keyword : keywords) {
            if (text.contains(keyword)) {
                return true;
            }
        }
        return false;
    }

    private static DemoCatalog.Dish dish(String id) {
        DemoCatalog.Dish dish = DemoCatalog.DISH_BY_ID.get(id);
        if (dish == null) {
            throw new IllegalStateException("菜单缺少菜品 " + id);
        }
        return dish;
    }
}
