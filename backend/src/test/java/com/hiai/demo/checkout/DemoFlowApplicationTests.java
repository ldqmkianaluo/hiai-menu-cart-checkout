package com.hiai.demo.checkout;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class DemoFlowApplicationTests {
    @Autowired
    MockMvc mvc;

    @Test
    void completeDemoFlowStopsAtCheckoutPreview() throws Exception {
        mvc.perform(get("/api/demo/menu"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dishes", hasSize(8)));

        mvc.perform(post("/api/demo/cart/items")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sessionId":"test-session","dishId":"dish-001","quantity":2}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itemCount").value(2))
                .andExpect(jsonPath("$.total").value(76.0));

        mvc.perform(post("/api/demo/checkout/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sessionId":"test-session"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.demoOnly").value(true))
                .andExpect(jsonPath("$.total").value(76.0))
                .andExpect(jsonPath("$.paymentMethods", hasSize(2)));

        mvc.perform(get("/api/demo/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentEnabled").value(false));
    }
}
