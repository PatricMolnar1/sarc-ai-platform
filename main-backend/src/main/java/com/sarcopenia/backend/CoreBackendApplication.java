package com.sarcopenia.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Core Backend entry point. This is the authority service that owns the
 * PostgreSQL schema and permanent file storage. It is invoked only by the Web
 * UI on an explicit Save; it has no knowledge of or connection to the AI Worker.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class CoreBackendApplication {
    public static void main(String[] args) {
        SpringApplication.run(CoreBackendApplication.class, args);
    }
}
