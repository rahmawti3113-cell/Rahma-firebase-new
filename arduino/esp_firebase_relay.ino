// Firebase Realtime Database - ESP32/ESP8266
// Relay 4 channel + DHT11
// Versi: Variasi 1 & 2 Looping + Semua ON + Semua OFF

#if defined(ESP32)
  #include <WiFi.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
#endif
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>
#include "DHT.h"

#define WIFI_SSID       "rahma"
#define WIFI_PASSWORD   "123456789"
#define API_KEY         "AIzaSyClDtdqmkYd81Q37iAxaySjlHvbjmRLKdk"
#define DATABASE_URL    "rahmawati-f85d2-default-rtdb.asia-southeast1.firebasedatabase.app"

#if defined(ESP32)
  #define RELAY1  23
  #define RELAY2  19
  #define RELAY3  18
  #define RELAY4  5
  #define DHTPIN  4
#endif

#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

#define RELAY_ON  LOW
#define RELAY_OFF HIGH

FirebaseData fbdo;
FirebaseData fbdo2;
FirebaseAuth auth;
FirebaseConfig config;

unsigned long previousMillisDHT      = 0;
unsigned long previousMillisFirebase = 0;
unsigned long previousMillisVariasi  = 0;

const long intervalDHT      = 5000;
const long intervalFirebase = 500;
const long intervalVariasi  = 50;

int  modeVariasi     = 0;
int  stepVariasi     = 0;
bool variasiBerjalan = false;

void matikanSemuaRelay() {
  digitalWrite(RELAY1, RELAY_OFF);
  digitalWrite(RELAY2, RELAY_OFF);
  digitalWrite(RELAY3, RELAY_OFF);
  digitalWrite(RELAY4, RELAY_OFF);
}

void nyalakanSemuaRelay() {
  digitalWrite(RELAY1, RELAY_ON);
  digitalWrite(RELAY2, RELAY_ON);
  digitalWrite(RELAY3, RELAY_ON);
  digitalWrite(RELAY4, RELAY_ON);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("============================================");
  Serial.println("        ESP32 Firebase Relay + DHT11        ");
  Serial.println("============================================");

  pinMode(RELAY1, OUTPUT);
  pinMode(RELAY2, OUTPUT);
  pinMode(RELAY3, OUTPUT);
  pinMode(RELAY4, OUTPUT);
  matikanSemuaRelay();
  Serial.println("Relay diinisialisasi (semua OFF)");

  dht.begin();
  Serial.println("Sensor DHT11 diinisialisasi");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Koneksi ke WiFi: ");
  Serial.print(WIFI_SSID);

  int wifiRetry = 0;
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
    wifiRetry++;
    if (wifiRetry > 40) {
      Serial.println();
      Serial.println("WiFi GAGAL! Restart.");
      while (true) delay(1000);
    }
  }

  Serial.println();
  Serial.println("WiFi Terhubung!");
  Serial.println(WiFi.localIP());

  config.api_key      = API_KEY;
  config.database_url = DATABASE_URL;
  auth.user.email     = "";
  auth.user.password  = "";

  config.token_status_callback = tokenStatusCallback;
  config.max_token_generation_retry = 5;

  fbdo.setResponseSize(4096);
  fbdo2.setResponseSize(4096);

  Firebase.reconnectWiFi(true);
  Firebase.begin(&config, &auth);
  Firebase.signUp(&config, &auth, "", "");

  Serial.print("Menunggu token Firebase");
  unsigned long startWait = millis();
  while (!Firebase.ready()) {
    Serial.print(".");
    delay(500);
    if (millis() - startWait > 30000) {
      Serial.println("Firebase timeout!");
      break;
    }
  }

  if (Firebase.ready()) {
    Serial.println();
    Serial.println("Firebase Terhubung & Siap!");

    Firebase.RTDB.setBool(&fbdo, "/IoT/Relay1", false);
    Firebase.RTDB.setBool(&fbdo, "/IoT/Relay2", false);
    Firebase.RTDB.setBool(&fbdo, "/IoT/Relay3", false);
    Firebase.RTDB.setBool(&fbdo, "/IoT/Relay4", false);
    Firebase.RTDB.setInt(&fbdo,  "/IoT/Mode",   0);
    Firebase.RTDB.setBool(&fbdo, "/IoT/AllOff", false);
    Firebase.RTDB.setBool(&fbdo, "/IoT/AllOn",  false);
    Serial.println("Nilai awal dikirim ke Firebase");
  }
}

void loop() {
  unsigned long currentMillis = millis();

  // ===== VARIASI RUNNING LED =====
  if (variasiBerjalan && (currentMillis - previousMillisVariasi >= intervalVariasi)) {
    previousMillisVariasi = currentMillis;

    matikanSemuaRelay();

    if (modeVariasi == 1) {
      switch (stepVariasi) {
        case 0: digitalWrite(RELAY1, RELAY_ON); break;
        case 1: digitalWrite(RELAY2, RELAY_ON); break;
        case 2: digitalWrite(RELAY3, RELAY_ON); break;
        case 3: digitalWrite(RELAY4, RELAY_ON); break;
      }
    } else if (modeVariasi == 2) {
      switch (stepVariasi) {
        case 0: digitalWrite(RELAY4, RELAY_ON); break;
        case 1: digitalWrite(RELAY3, RELAY_ON); break;
        case 2: digitalWrite(RELAY2, RELAY_ON); break;
        case 3: digitalWrite(RELAY1, RELAY_ON); break;
      }
    }

    stepVariasi++;
    if (stepVariasi >= 4) stepVariasi = 0;
  }

  // ===== BACA SENSOR DHT11 =====
  if (currentMillis - previousMillisDHT >= intervalDHT) {
    previousMillisDHT = currentMillis;

    float h = dht.readHumidity();
    float t = dht.readTemperature();

    if (!isnan(h) && !isnan(t)) {
      Serial.printf("Suhu: %.1f C | Kelembapan: %.1f %%\n", t, h);
      if (Firebase.ready()) {
        Firebase.RTDB.setFloat(&fbdo, "/IoT/Suhu", t);
        Firebase.RTDB.setFloat(&fbdo, "/IoT/Kelembapan", h);
      }
    } else {
      Serial.println("Gagal baca DHT11!");
    }
  }

  // ===== CEK PERINTAH DARI FIREBASE =====
  if (currentMillis - previousMillisFirebase >= intervalFirebase) {
    previousMillisFirebase = currentMillis;

    if (Firebase.ready()) {

      // 1. Cek AllOff
      if (Firebase.RTDB.getBool(&fbdo2, "/IoT/AllOff")) {
        if (fbdo2.boolData()) {
          matikanSemuaRelay();
          modeVariasi     = 0;
          stepVariasi     = 0;
          variasiBerjalan = false;
          Firebase.RTDB.setBool(&fbdo, "/IoT/Relay1", false);
          Firebase.RTDB.setBool(&fbdo, "/IoT/Relay2", false);
          Firebase.RTDB.setBool(&fbdo, "/IoT/Relay3", false);
          Firebase.RTDB.setBool(&fbdo, "/IoT/Relay4", false);
          Firebase.RTDB.setInt(&fbdo,  "/IoT/Mode",   0);
          Firebase.RTDB.setBool(&fbdo, "/IoT/AllOff", false);
          Firebase.RTDB.setBool(&fbdo, "/IoT/AllOn",  false);
          Serial.println("SEMUA RELAY OFF!");
          return;
        }
      }

      // 2. Cek AllOn
      if (Firebase.RTDB.getBool(&fbdo2, "/IoT/AllOn")) {
        if (fbdo2.boolData()) {
          nyalakanSemuaRelay();
          modeVariasi     = 0;
          stepVariasi     = 0;
          variasiBerjalan = false;
          Firebase.RTDB.setBool(&fbdo, "/IoT/Relay1", true);
          Firebase.RTDB.setBool(&fbdo, "/IoT/Relay2", true);
          Firebase.RTDB.setBool(&fbdo, "/IoT/Relay3", true);
          Firebase.RTDB.setBool(&fbdo, "/IoT/Relay4", true);
          Firebase.RTDB.setInt(&fbdo,  "/IoT/Mode",   0);
          Firebase.RTDB.setBool(&fbdo, "/IoT/AllOn",  false);
          Serial.println("SEMUA RELAY ON!");
          return;
        }
      }

      // 3. Cek Mode Variasi
      if (Firebase.RTDB.getInt(&fbdo2, "/IoT/Mode")) {
        int modeBaru = fbdo2.intData();
        if (modeBaru != modeVariasi) {
          modeVariasi = modeBaru;
          if (modeBaru == 1 || modeBaru == 2) {
            stepVariasi     = 0;
            variasiBerjalan = true;
            matikanSemuaRelay();
            Serial.printf("Mode variasi %d dimulai!\n", modeVariasi);
          } else {
            variasiBerjalan = false;
          }
        }
      }

      // 4. Mode normal - kontrol relay individual
      if (!variasiBerjalan && modeVariasi == 0) {
        bool r1 = false, r2 = false, r3 = false, r4 = false;
        if (Firebase.RTDB.getBool(&fbdo2, "/IoT/Relay1")) r1 = fbdo2.boolData();
        if (Firebase.RTDB.getBool(&fbdo2, "/IoT/Relay2")) r2 = fbdo2.boolData();
        if (Firebase.RTDB.getBool(&fbdo2, "/IoT/Relay3")) r3 = fbdo2.boolData();
        if (Firebase.RTDB.getBool(&fbdo2, "/IoT/Relay4")) r4 = fbdo2.boolData();

        digitalWrite(RELAY1, r1 ? RELAY_ON : RELAY_OFF);
        digitalWrite(RELAY2, r2 ? RELAY_ON : RELAY_OFF);
        digitalWrite(RELAY3, r3 ? RELAY_ON : RELAY_OFF);
        digitalWrite(RELAY4, r4 ? RELAY_ON : RELAY_OFF);

        Serial.printf("Relay: [R1:%s][R2:%s][R3:%s][R4:%s]\n",
          r1?"ON":"OFF", r2?"ON":"OFF", r3?"ON":"OFF", r4?"ON":"OFF");
      }
    }
  }
}
