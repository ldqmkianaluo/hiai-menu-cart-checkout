package com.hiai.demo.checkout;

import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

/** 演示用预约：座位与时段都不真实占用，只返回一个可查询的单号。 */
@Service
class DemoReservationService {
    static final List<String> SLOTS = List.of(
            "11:00", "11:30", "12:00", "12:30", "13:00",
            "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00");

    record Reservation(String code, String name, String phone, String date, String time, int partySize,
                       String note, String table, String status, String createdAt, String hint) {}

    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private final Map<String, Reservation> store = new ConcurrentHashMap<>();

    Reservation create(String name, String phone, String date, String time, int partySize, String note,
                       String table) {
        String cleanName = trim(name);
        String cleanPhone = trim(phone);
        String cleanDate = trim(date);
        String cleanTime = trim(time);

        if (cleanName.isEmpty() || cleanName.length() > 16) {
            throw new IllegalArgumentException("请填写 1–16 个字的用餐人称呼");
        }
        if (!cleanPhone.matches("^1\\d{10}$")) {
            throw new IllegalArgumentException("手机号请填 11 位，用于到店核对");
        }
        LocalDate parsed;
        try {
            parsed = LocalDate.parse(cleanDate);
        } catch (DateTimeParseException error) {
            throw new IllegalArgumentException("日期格式应为 YYYY-MM-DD");
        }
        if (parsed.isBefore(LocalDate.now())) {
            throw new IllegalArgumentException("不能预约过去的日期");
        }
        if (!SLOTS.contains(cleanTime)) {
            throw new IllegalArgumentException("这个时段不在可预约范围内");
        }
        if (partySize < 1 || partySize > 12) {
            throw new IllegalArgumentException("人数请填 1–12 位");
        }

        String code = "R-" + randomCode(4);
        Reservation reservation = new Reservation(code, cleanName, cleanPhone, cleanDate, cleanTime, partySize,
                trim(note), trim(table), "CONFIRMED", OffsetDateTime.now().toString(),
                "演示预约：不占真实座位，到店请以此号核对");
        store.put(code, reservation);
        return reservation;
    }

    Reservation find(String code) {
        Reservation reservation = store.get(trim(code));
        if (reservation == null) {
            throw new IllegalArgumentException("没有找到这个预约号");
        }
        return reservation;
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
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
