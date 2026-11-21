package com.hiai.demo.checkout;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 「智能点餐」目前是本地规则引擎：按关键词、人数、预算做菜谱搭配。
 * 没有接入任何大模型，返回结果里带 disclaimer 字段，界面必须如实展示。
 */
@Service
class DemoAgentService {
    private static final String DISCLAIMER = "规则推荐 · 本地关键词匹配，未调用任何大模型";

    record Suggestion(String dishId, String name, BigDecimal price, int quantity, BigDecimal lineTotal,
                      String reason, String artColor) {}

    record Recommendation(String reply, Map<String, Boolean> signals, List<Suggestion> items, int partySize,
                          int budget, BigDecimal total, boolean withinBudget, String disclaimer) {}

    private record Pick(DemoCatalog.Dish dish, int quantity, String reason) {}

    Recommendation recommend(String demand, int partySizeInput, int budgetInput) {
        String text = demand == null ? "" : demand.trim();
        int party = Math.min(12, Math.max(1, partySizeInput <= 0 ? 2 : partySizeInput));
        int budget = Math.max(0, budgetInput);

        boolean spicy = contains(text, "辣", "重口", "川", "湘", "下饭");
        boolean light = contains(text, "清淡", "不辣", "少油", "养生", "老人");
        boolean veg = contains(text, "素", "青菜", "蔬菜", "沙拉", "健康");
        boolean soup = contains(text, "汤", "面", "暖");
        boolean wantsDrink = contains(text, "饮料", "喝的", "茶", "饮", "解辣", "解腻");
        boolean fish = contains(text, "鱼");
        boolean beef = contains(text, "牛肉", "牛");

        DemoCatalog.Dish main = fish ? dish("dish-002") : (beef || spicy ? dish("dish-003") : dish("dish-001"));
        DemoCatalog.Dish vegDish = dish("dish-004");
        DemoCatalog.Dish staple = soup ? dish("dish-006") : dish("dish-005");
        DemoCatalog.Dish drink = (spicy || wantsDrink) ? dish(spicy ? "dish-007" : "dish-008") : null;

        List<Pick> picks = new ArrayList<>();
        picks.add(new Pick(main, Math.min(3, Math.max(1, (party + 1) / 2)),
                spicy ? "你提到想吃辣/下饭，这道是店里最扛饭的硬菜"
                        : fish ? "你点名要吃鱼，这锅鱼头适合多人分"
                        : "荤菜里最稳的一道，大多数人第一次来都会点"));
        picks.add(new Pick(vegDish, party >= 4 ? 2 : 1,
                light || veg ? "你要求清淡，这道少油现炒，能中和前面的重口" : "一荤一素才像正经吃饭，解腻"));
        picks.add(new Pick(staple, party,
                soup ? "你说想喝汤，汤面比炒饭更合适" : "按人数配的主食，先保证吃饱"));
        if (drink != null) {
            picks.add(new Pick(drink, Math.max(1, (party + 1) / 2),
                    spicy ? "辣味配酸甜冰饮，解辣最快" : "无糖茶饮，不额外占预算"));
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

        BigDecimal total = totalOf(picks);
        boolean withinBudget = budget == 0 || total.compareTo(BigDecimal.valueOf(budget)) <= 0;

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
        reply.append("：给你配了 ").append(items).append("，合计 ¥").append(total.setScale(2, java.math.RoundingMode.HALF_UP));
        if (!withinBudget) {
            reply.append("。已超预算 ¥")
                    .append(total.subtract(BigDecimal.valueOf(budget)).setScale(2, java.math.RoundingMode.HALF_UP))
                    .append("，要不要去掉饮料或减一份主食？");
        }
        if (light && spicy) {
            reply.append(" 你同时提了「辣」和「清淡」，我按辣优先，素菜用来平衡。");
        }

        Map<String, Boolean> signals = new LinkedHashMap<>();
        signals.put("spicy", spicy);
        signals.put("light", light);
        signals.put("veg", veg);
        signals.put("soup", soup);
        signals.put("drink", wantsDrink);
        signals.put("fish", fish);
        signals.put("beef", beef);

        List<Suggestion> suggestions = new ArrayList<>();
        for (Pick pick : picks) {
            suggestions.add(new Suggestion(pick.dish().id(), pick.dish().name(), pick.dish().price(), pick.quantity(),
                    pick.dish().price().multiply(BigDecimal.valueOf(pick.quantity())), pick.reason(),
                    pick.dish().artColor()));
        }
        return new Recommendation(reply.toString(), signals, suggestions, party, budget, total, withinBudget,
                DISCLAIMER);
    }

    private static BigDecimal totalOf(List<Pick> picks) {
        BigDecimal total = BigDecimal.ZERO;
        for (Pick pick : picks) {
            total = total.add(pick.dish().price().multiply(BigDecimal.valueOf(pick.quantity())));
        }
        return total;
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
