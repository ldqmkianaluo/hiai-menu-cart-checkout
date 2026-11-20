package com.hiai.demo.checkout;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
class DemoCartService {
    private final Map<String, Map<String, Integer>> carts = new ConcurrentHashMap<>();

    CartView get(String sessionId) {
        validateSession(sessionId);
        Map<String, Integer> quantities = carts.getOrDefault(sessionId, Map.of());
        List<CartLine> items = new ArrayList<>();
        quantities.forEach((dishId, quantity) -> {
            DemoCatalog.Dish dish = DemoCatalog.DISH_BY_ID.get(dishId);
            if (dish != null && quantity > 0) {
                items.add(new CartLine(dish.id(), dish.name(), dish.icon(), dish.artColor(), dish.price(), quantity,
                        dish.price().multiply(BigDecimal.valueOf(quantity))));
            }
        });
        items.sort(Comparator.comparing(CartLine::dishId));
        int itemCount = items.stream().mapToInt(CartLine::quantity).sum();
        BigDecimal total = items.stream().map(CartLine::lineTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new CartView(List.copyOf(items), itemCount, total);
    }

    CartView setQuantity(String sessionId, String dishId, int quantity) {
        validateSession(sessionId);
        if (!DemoCatalog.DISH_BY_ID.containsKey(dishId)) {
            throw new IllegalArgumentException("菜品不存在或已下架");
        }
        if (quantity < 0 || quantity > 99) {
            throw new IllegalArgumentException("菜品数量必须在 0 到 99 之间");
        }
        Map<String, Integer> cart = carts.computeIfAbsent(sessionId, ignored -> new ConcurrentHashMap<>());
        if (quantity == 0) cart.remove(dishId);
        else cart.put(dishId, quantity);
        return get(sessionId);
    }

    private static void validateSession(String sessionId) {
        if (sessionId == null || sessionId.isBlank() || sessionId.length() > 100) {
            throw new IllegalArgumentException("缺少有效的演示会话标识");
        }
    }

    record CartLine(String dishId, String name, String icon, String artColor, BigDecimal price,
                    int quantity, BigDecimal lineTotal) {}
    record CartView(List<CartLine> items, int itemCount, BigDecimal total) {}
}
