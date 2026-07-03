# Core Backend image (Spring Boot on port 8080).
# Multi-stage: build the fat jar with Maven, then run on a slim Temurin 21 JRE.

# Build stage
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Cache dependencies first (only re-resolves when the pom changes).
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:21-jre
WORKDIR /app

# Permanent file storage lives here; Docker mounts a named volume.
ENV STORAGE_ROOT=/app/storage
RUN mkdir -p /app/storage

COPY --from=build /build/target/core-backend-*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
