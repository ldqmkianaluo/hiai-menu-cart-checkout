package com.hiai.demo.checkout;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/demo")
@CrossOrigin(origins = {"http://localhost:3000", "http://127.0.0.1:3000"})
class DemoFlowController {
    private final DemoCartService carts;

    DemoFlowController(DemoCartService carts) {
        this.carts = carts;
    }

    @GetMapping("/health")
    Map<String, Object> health() {
        return Map.of("status", "UP", "mode", "DEMO_ONLY", "paymentEnabled", false);
    }

    @GetMapping("/menu")
    MenuView menu() {
        return new MenuView(DemoCatalog.STORE, DemoCatalog.CATEGORIES, DemoCatalog.DISHES);
    }

    @GetMapping("/cart")
    DemoCartService.CartView cart(@NotBlank String sessionId) {
        return carts.get(sessionId);
    }

    @PostMapping("/cart/items")
    DemoCartService.CartView setCartItem(@Valid @RequestBody SetCartItem command) {
        return carts.setQuantity(command.sessionId(), command.dishId(), command.quantity());
    }

    @PostMapping("/checkout/preview")
    CheckoutPreview checkoutPreview(@Valid @RequestBody CheckoutCommand command) {
        DemoCartService.CartView cart = carts.get(command.sessionId());
        List<DemoCartService.CartLine> selectedItems = cart.items();
        if (command.dishIds() != null && !command.dishIds().isEmpty()) {
            Set<String> selectedIds = Set.copyOf(command.dishIds());
            selectedItems = cart.items().stream()
                    .filter(item -> selectedIds.contains(item.dishId()))
                    .toList();
        }
        if (selectedItems.isEmpty()) {
            throw new IllegalArgumentException("购物车为空，暂时无法生成结算预览");
        }
        int selectedCount = selectedItems.stream().mapToInt(DemoCartService.CartLine::quantity).sum();
        java.math.BigDecimal selectedTotal = selectedItems.stream()
                .map(DemoCartService.CartLine::lineTotal)
                .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add);
        String suffix = command.sessionId().replaceAll("[^A-Za-z0-9]", "");
        suffix = suffix.substring(Math.max(0, suffix.length() - 6));
        return new CheckoutPreview(
                "DEMO-" + suffix.toUpperCase() + "-" + Instant.now().getEpochSecond(),
                selectedItems, selectedCount, selectedTotal,
                List.of(
                        new PaymentMethod("wechat_demo", "微信支付", "仅展示，不会唤起微信支付", "微"),
                        new PaymentMethod("counter_demo", "到店付款", "仅展示，不会创建收款任务", "店")
                ),
                true
        );
    }

    @ExceptionHandler({IllegalArgumentException.class, MethodArgumentNotValidException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorView badRequest(Exception error) {
        String message = error instanceof MethodArgumentNotValidException validation
                ? validation.getBindingResult().getAllErrors().get(0).getDefaultMessage()
                : error.getMessage();
        return new ErrorView(message == null ? "请求参数不正确" : message);
    }

    record MenuView(DemoCatalog.Store store, List<DemoCatalog.Category> categories,
                    List<DemoCatalog.Dish> dishes) {}
    record SetCartItem(@NotBlank(message = "缺少会话标识") String sessionId,
                       @NotBlank(message = "缺少菜品标识") String dishId,
                       @Min(value = 0, message = "数量不能小于 0")
                       @Max(value = 99, message = "数量不能大于 99") int quantity) {}
    record CheckoutCommand(@NotBlank(message = "缺少会话标识") String sessionId,
                           List<String> dishIds) {}
    record PaymentMethod(String code, String label, String description, String icon) {}
    record CheckoutPreview(String previewNo, List<DemoCartService.CartLine> items, int itemCount,
                           java.math.BigDecimal total, List<PaymentMethod> paymentMethods, boolean demoOnly) {}
    record ErrorView(String message) {}
}
