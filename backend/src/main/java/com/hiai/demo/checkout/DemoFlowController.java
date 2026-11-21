package com.hiai.demo.checkout;

import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Validated
@RestController
@RequestMapping("/api/demo")
@CrossOrigin(origins = {"http://localhost:3000", "http://127.0.0.1:3000"})
class DemoFlowController {
    private final DemoCartService carts;
    private final DemoPromoService promos;
    private final DemoReservationService reservations;
    private final DemoAgentService agent;

    DemoFlowController(DemoCartService carts, DemoPromoService promos, DemoReservationService reservations,
                       DemoAgentService agent) {
        this.carts = carts;
        this.promos = promos;
        this.reservations = reservations;
        this.agent = agent;
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
    DemoCartService.CartView cart(@RequestParam(required = false) String table,
                                  @RequestParam(required = false) String sessionId,
                                  @RequestParam(required = false) String member) {
        return carts.get(resolveTable(table, sessionId), member);
    }

    @PostMapping("/cart/items")
    DemoCartService.CartView setCartItem(@Valid @RequestBody SetCartItem command) {
        return carts.setQuantity(resolveTable(command.table(), command.sessionId()),
                command.member(), command.memberName(), command.dishId(), command.quantity());
    }

    @PostMapping("/checkout/preview")
    CheckoutPreview checkoutPreview(@Valid @RequestBody CheckoutCommand command) {
        String table = resolveTable(command.table(), command.sessionId());
        DemoCartService.CartView cart = carts.get(table, null);
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
        java.math.BigDecimal subtotal = selectedItems.stream()
                .map(DemoCartService.CartLine::lineTotal)
                .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add);
        int memberCount = Math.max(1, cart.members().size());
        int baseRate = DemoPromoService.baseRate(memberCount);
        java.math.BigDecimal baseDiscount = subtotal
                .multiply(java.math.BigDecimal.valueOf(baseRate))
                .divide(java.math.BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
        java.math.BigDecimal afterBase = subtotal.subtract(baseDiscount);
        java.math.BigDecimal couponDiscount = promos.discountOf(command.couponCode(), afterBase);
        java.math.BigDecimal floor = subtotal
                .multiply(java.math.BigDecimal.valueOf(60))
                .divide(java.math.BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
        java.math.BigDecimal discounted = afterBase.subtract(couponDiscount);
        java.math.BigDecimal payTotal = discounted.max(floor);
        boolean floorApplied = discounted.compareTo(floor) < 0;
        java.math.BigDecimal discount = subtotal.subtract(payTotal);
        String couponNote = "";
        DemoPromoService.CouponView coupon = promos.view(command.couponCode());
        if (coupon == null && command.couponCode() != null && !command.couponCode().isBlank()) {
            couponNote = "这张券本单不可用（已过期或金额未达门槛）";
        } else if (coupon != null && couponDiscount.compareTo(java.math.BigDecimal.ZERO) == 0) {
            couponNote = "这张券本单不可用（金额未达门槛）";
        } else if (coupon != null && couponDiscount.compareTo(java.math.BigDecimal.ZERO) > 0) {
            couponNote = "已使用「" + coupon.name() + "」";
        }
        String suffix = table.replaceAll("[^A-Za-z0-9]", "");
        suffix = suffix.substring(Math.max(0, suffix.length() - 6));
        return new CheckoutPreview(
                "DEMO-" + suffix.toUpperCase() + "-" + Instant.now().getEpochSecond(),
                selectedItems, selectedCount, subtotal, subtotal, memberCount, baseRate, baseDiscount,
                couponDiscount, discount, floorApplied, floor, payTotal,
                couponDiscount.compareTo(java.math.BigDecimal.ZERO) > 0 ? coupon : null, couponNote,
                List.of(
                        new PaymentMethod("wechat_demo", "微信支付", "仅展示，不会唤起微信支付", "微"),
                        new PaymentMethod("counter_demo", "到店付款", "仅展示，不会创建收款任务", "店")
                ),
                true
        );
    }

    @PostMapping("/promo/draw")
    DemoPromoService.DrawResult drawPrize(@Valid @RequestBody DrawCommand command) {
        String table = resolveTable(command.table(), command.sessionId());
        int memberCount = Math.max(1, carts.get(table, null).members().size());
        return promos.draw(table, command.member(), memberCount);
    }

    /** 抽奖配额与当前折扣规则，前端首页/抽奖页用来显示「还剩几次」。 */
    @GetMapping("/promo/status")
    Map<String, Object> promoStatus(@RequestParam(name = "table", required = false) String table,
                                    @RequestParam(name = "sessionId", required = false) String sessionId,
                                    @RequestParam(name = "member") String member) {
        String resolved = resolveTable(table, sessionId);
        int memberCount = Math.max(1, carts.get(resolved, null).members().size());
        int quota = DemoPromoService.quotaOf(memberCount);
        int used = promos.usedOf(resolved, member);
        return Map.of(
                "memberCount", memberCount,
                "total", quota,
                "used", used,
                "remaining", Math.max(0, quota - used),
                "baseRate", DemoPromoService.baseRate(memberCount),
                "baseLabel", DemoPromoService.baseRate(memberCount) + "% 拼桌折扣",
                "prizes", java.util.List.of()
        );
    }

    @PostMapping("/reservations")
    DemoReservationService.Reservation createReservation(@Valid @RequestBody ReserveCommand command) {
        return reservations.create(command.name(), command.phone(), command.date(), command.time(),
                command.partySize(), command.note(), command.table());
    }

    @GetMapping("/reservations/{code}")
    DemoReservationService.Reservation reservation(@org.springframework.web.bind.annotation.PathVariable String code) {
        return reservations.find(code);
    }

    /** 我的预约：按手机号查，演示环境只按手机号过滤内存里的单子。 */
    @GetMapping("/reservations")
    List<DemoReservationService.Reservation> myReservations(
            @RequestParam(name = "phone") String phone) {
        return reservations.listByPhone(phone);
    }

    @PostMapping("/agent/recommend")
    DemoAgentService.Recommendation recommend(@Valid @RequestBody AgentCommand command) {
        return agent.recommend(command.demand(), command.partySize(), command.budget());
    }

    /** 服务员助手对话：有 AI_API_KEY 走 DeepSeek，没有就规则兜底。 */
    @PostMapping("/agent/chat")
    DemoAgentService.ChatReply chat(@Valid @RequestBody ChatCommand command) {
        return agent.chat(command.messages(), command.partySize(), command.budget());
    }

    /** 兼容旧调用：以前只有一个 sessionId 字段，现在优先用桌号，没有就退回 sessionId。 */
    private static String resolveTable(String table, String sessionId) {
        String value = table != null && !table.isBlank() ? table : sessionId;
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("缺少桌号，请从桌上的二维码重新扫码进入");
        }
        return value.trim();
    }

    @ExceptionHandler({IllegalArgumentException.class, MethodArgumentNotValidException.class,
            ConstraintViolationException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorView badRequest(Exception error) {
        String message;
        if (error instanceof MethodArgumentNotValidException validation) {
            message = validation.getBindingResult().getAllErrors().get(0).getDefaultMessage();
        } else if (error instanceof ConstraintViolationException violation) {
            message = violation.getConstraintViolations().stream()
                    .findFirst()
                    .map(constraint -> constraint.getMessage())
                    .orElse("请求参数不正确");
        } else {
            message = error.getMessage();
        }
        return new ErrorView(message == null ? "请求参数不正确" : message);
    }

    record MenuView(DemoCatalog.Store store, List<DemoCatalog.Category> categories,
                    List<DemoCatalog.Dish> dishes) {}
    record SetCartItem(String table, String sessionId, String member, String memberName,
                       @NotBlank(message = "缺少菜品标识") String dishId,
                       @Min(value = 0, message = "数量不能小于 0")
                       @Max(value = 99, message = "数量不能大于 99") int quantity) {}
    record CheckoutCommand(String table, String sessionId, List<String> dishIds, String couponCode) {}
    record DrawCommand(String table, String sessionId,
                       @NotBlank(message = "缺少用餐人标识") String member) {}
    record ReserveCommand(@NotBlank(message = "请填写用餐人称呼") String name,
                          @NotBlank(message = "请填写手机号") String phone,
                          @NotBlank(message = "请选择日期") String date,
                          @NotBlank(message = "请选择时段") String time,
                          @Min(value = 1, message = "人数请填 1–12 位")
                          @Max(value = 12, message = "人数请填 1–12 位") int partySize,
                          String note, String table) {}
    record AgentCommand(@NotBlank(message = "请说一下想吃什么") String demand, int partySize, int budget) {}

    record ChatCommand(@NotNull(message = "对话内容不能为空") List<DemoAgentService.ChatMessage> messages,
                       int partySize, int budget) {}
    record PaymentMethod(String code, String label, String description, String icon) {}
    record CheckoutPreview(String previewNo, List<DemoCartService.CartLine> items, int itemCount,
                           java.math.BigDecimal subtotal, java.math.BigDecimal total, int memberCount,
                           int baseRate, java.math.BigDecimal baseDiscount, java.math.BigDecimal couponDiscount,
                           java.math.BigDecimal discount, boolean floorApplied, java.math.BigDecimal floor,
                           java.math.BigDecimal payTotal,
                           DemoPromoService.CouponView coupon, String couponNote,
                           List<PaymentMethod> paymentMethods, boolean demoOnly) {}
    record ErrorView(String message) {}
}
