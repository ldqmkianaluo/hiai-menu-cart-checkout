package com.hiai.demo.checkout;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

/** 演示用推广活动：抽奖发券，结算时抵扣。全部数据留在内存，重启即清空。 */
@Service
class DemoPromoService {
    static final int MAX_DRAWS_PER_MEMBER = 3;
    private static final long COUPON_TTL_MILLIS = 30 * 60 * 1000L;
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    enum Kind {FREE, PERCENT, THRESHOLD, NONE}

    record Prize(String id, String name, String shortName, int weight, Kind kind, int value, int threshold,
                 String detail) {}

    record Coupon(String code, String table, String member, String prizeId, String name, Kind kind, int value,
                  int threshold, long expiresAt) {}

    record CouponView(String code, String name, String detail) {}

    record DrawResult(Prize prize, CouponView coupon, int remaining, int quota, int memberCount, int baseRate) {}

    private static final List<Prize> PRIZES = List.of(
            new Prize("free", "整单免单", "免单", 1, Kind.FREE, 0, 0, "本单全免（演示用，不涉及真实收款）"),
            new Prize("r30", "满 100 减 30", "减30", 3, Kind.THRESHOLD, 30, 100, "满 100 元可用"),
            new Prize("p80", "整单 8 折", "8折", 5, Kind.PERCENT, 80, 0, "按实付金额 8 折"),
            new Prize("p90", "整单 9 折", "9折", 9, Kind.PERCENT, 90, 0, "按实付金额 9 折"),
            new Prize("p95", "整单 95 折", "95折", 12, Kind.PERCENT, 95, 0, "按实付金额 95 折"),
            new Prize("none", "谢谢参与", "下次再来", 14, Kind.NONE, 0, 0, "这次没中，换个同事再抽一次")
    );

    private static final int TOTAL_WEIGHT = PRIZES.stream().mapToInt(Prize::weight).sum();

    private final Map<String, Integer> draws = new ConcurrentHashMap<>();
    private final Map<String, Coupon> coupons = new ConcurrentHashMap<>();

    /** 同桌人数阶梯：人越多基础折扣越高，封顶 8%。 */
    static int baseRate(int memberCount) {
        if (memberCount >= 5) {
            return 8;
        }
        if (memberCount >= 4) {
            return 5;
        }
        if (memberCount >= 3) {
            return 3;
        }
        return 0;
    }

    /** 每人基础 3 次，同桌每多 1 人 +1 次，最多 +2 次。 */
    static int quotaOf(int memberCount) {
        int bonus = Math.min(2, Math.max(0, memberCount - 1));
        return MAX_DRAWS_PER_MEMBER + bonus;
    }

    DrawResult draw(String table, String member, int memberCount) {
        String key = table + "/" + member;
        int quota = quotaOf(memberCount);
        int used = draws.getOrDefault(key, 0);
        if (used >= quota) {
            throw new IllegalArgumentException("你在这桌已经抽满 " + quota + " 次了，再多叫一位同事同桌还能多抽一次");
        }
        draws.put(key, used + 1);

        Prize prize = pickPrize();
        Coupon coupon = null;
        if (prize.kind() != Kind.NONE) {
            coupon = issue(table, member, prize);
        }
        int remaining = Math.max(0, quota - (used + 1));
        return new DrawResult(prize, view(coupon), remaining, quota, memberCount, baseRate(memberCount));
    }

    DrawResult draw(String table, String member) {
        return draw(table, member, 1);
    }

    int usedOf(String table, String member) {
        return draws.getOrDefault(table + "/" + member, 0);
    }

    BigDecimal discountOf(String code, BigDecimal subtotal) {
        Coupon coupon = usable(code);
        if (coupon == null || subtotal == null) {
            return BigDecimal.ZERO;
        }
        switch (coupon.kind()) {
            case FREE:
                return subtotal;
            case PERCENT:
                return subtotal.multiply(BigDecimal.valueOf(100 - coupon.value()))
                        .divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
            case THRESHOLD:
                if (subtotal.compareTo(BigDecimal.valueOf(coupon.threshold())) < 0) {
                    return BigDecimal.ZERO;
                }
                return BigDecimal.valueOf(coupon.value()).min(subtotal);
            default:
                return BigDecimal.ZERO;
        }
    }

    /** 结算页展示用：券存在且未过期才返回。 */
    CouponView view(String code) {
        return view(usable(code));
    }

    private CouponView view(Coupon coupon) {
        if (coupon == null) {
            return null;
        }
        String detail = switch (coupon.kind()) {
            case FREE -> "本单免单";
            case PERCENT -> "整单 " + coupon.value() + " 折";
            case THRESHOLD -> "满 " + coupon.threshold() + " 元减 " + coupon.value() + " 元";
            default -> "";
        };
        return new CouponView(coupon.code(), coupon.name(), detail);
    }

    private Coupon usable(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        Coupon coupon = coupons.get(code.trim());
        if (coupon == null || coupon.expiresAt() < System.currentTimeMillis()) {
            return null;
        }
        return coupon;
    }

    private Coupon issue(String table, String member, Prize prize) {
        String code = "LUCKY-" + randomCode(5);
        Coupon coupon = new Coupon(code, table, member, prize.id(), prize.name(), prize.kind(), prize.value(),
                prize.threshold(), System.currentTimeMillis() + COUPON_TTL_MILLIS);
        coupons.put(code, coupon);
        return coupon;
    }

    private static Prize pickPrize() {
        int ticket = ThreadLocalRandom.current().nextInt(TOTAL_WEIGHT);
        int cursor = 0;
        for (Prize prize : PRIZES) {
            cursor += prize.weight();
            if (ticket < cursor) {
                return prize;
            }
        }
        return PRIZES.get(PRIZES.size() - 1);
    }

    private static String randomCode(int length) {
        StringBuilder builder = new StringBuilder(length);
        ThreadLocalRandom random = ThreadLocalRandom.current();
        for (int i = 0; i < length; i++) {
            builder.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
        }
        return builder.toString();
    }
}
