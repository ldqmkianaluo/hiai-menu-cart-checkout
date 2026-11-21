package com.hiai.demo.checkout;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 共享购物车：按「桌号 → 成员 → 菜品」三层存放，同桌所有人的加减都会落到同一张桌上。
 * 前端每 3 秒拉一次视图，所以这里只做内存存储，不做任何推送。
 */
@Service
class DemoCartService {
    private final Map<String, Map<String, MemberCart>> tables = new ConcurrentHashMap<>();

    private static final class MemberCart {
        private final String name;
        private final Map<String, Integer> lines = new ConcurrentHashMap<>();

        private MemberCart(String name) {
            this.name = name;
        }
    }

    CartView get(String tableCode, String memberId) {
        validateTable(tableCode);
        Map<String, MemberCart> members = tables.getOrDefault(tableCode, Map.of());
        List<CartLine> items = new ArrayList<>();
        List<MemberView> memberViews = new ArrayList<>();
        for (Map.Entry<String, MemberCart> memberEntry : members.entrySet()) {
            String id = memberEntry.getKey();
            MemberCart member = memberEntry.getValue();
            int count = 0;
            BigDecimal sum = BigDecimal.ZERO;
            for (Map.Entry<String, Integer> line : member.lines.entrySet()) {
                DemoCatalog.Dish dish = DemoCatalog.DISH_BY_ID.get(line.getKey());
                int quantity = line.getValue();
                if (dish == null || quantity <= 0) {
                    continue;
                }
                BigDecimal lineTotal = dish.price().multiply(BigDecimal.valueOf(quantity));
                items.add(new CartLine(dish.id(), dish.name(), dish.icon(), dish.artColor(), dish.price(),
                        quantity, lineTotal, id, member.name));
                count += quantity;
                sum = sum.add(lineTotal);
            }
            if (count > 0) {
                memberViews.add(new MemberView(id, member.name, count, sum));
            }
        }
        items.sort(Comparator.comparing(CartLine::memberId).thenComparing(CartLine::dishId));
        memberViews.sort(Comparator.comparing(MemberView::id));
        int itemCount = items.stream().mapToInt(CartLine::quantity).sum();
        BigDecimal total = items.stream().map(CartLine::lineTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new CartView(tableCode, List.copyOf(items), itemCount, total, List.copyOf(memberViews));
    }

    CartView setQuantity(String tableCode, String memberId, String memberName, String dishId, int quantity) {
        validateTable(tableCode);
        String owner = memberId == null || memberId.isBlank() ? "guest" : memberId.trim();
        validateMember(owner);
        if (!DemoCatalog.DISH_BY_ID.containsKey(dishId)) {
            throw new IllegalArgumentException("菜品不存在或已下架");
        }
        if (quantity < 0 || quantity > 99) {
            throw new IllegalArgumentException("菜品数量必须在 0 到 99 之间");
        }
        Map<String, MemberCart> members = tables.computeIfAbsent(tableCode, ignored -> new ConcurrentHashMap<>());
        MemberCart member = members.computeIfAbsent(owner, ignored -> new MemberCart(defaultName(memberName, owner)));
        if (quantity == 0) {
            member.lines.remove(dishId);
        } else {
            member.lines.put(dishId, quantity);
        }
        if (member.lines.isEmpty()) {
            members.remove(owner);
        }
        if (members.isEmpty()) {
            tables.remove(tableCode);
        }
        return get(tableCode, owner);
    }

    private static String defaultName(String memberName, String memberId) {
        if (memberName == null || memberName.isBlank()) {
            return "桌友 " + memberId.substring(Math.max(0, memberId.length() - 4));
        }
        String trimmed = memberName.trim();
        return trimmed.length() > 16 ? trimmed.substring(0, 16) : trimmed;
    }

    private static void validateTable(String tableCode) {
        if (tableCode == null || tableCode.isBlank() || tableCode.length() > 24) {
            throw new IllegalArgumentException("缺少有效的桌号");
        }
    }

    private static void validateMember(String memberId) {
        if (memberId == null || memberId.isBlank() || memberId.length() > 64) {
            throw new IllegalArgumentException("缺少有效的用餐人标识");
        }
    }

    record CartLine(String dishId, String name, String icon, String artColor, BigDecimal price,
                    int quantity, BigDecimal lineTotal, String memberId, String memberName) {}

    record MemberView(String id, String name, int itemCount, BigDecimal total) {}

    record CartView(String table, List<CartLine> items, int itemCount, BigDecimal total,
                    List<MemberView> members) {}
}
