
// ====================== IMPORT ======================
const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");
const mqtt = require("mqtt");
const session = require("express-session");
const bcrypt = require("bcrypt");
const multer = require("multer");
const crypto = require("crypto");
const ExcelJs = require("exceljs");
const auth = require("./auth");

const app = express();
const PORT = 3000;

// ====================== MIDDLEWARE ======================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: "smart-saga-secret",
    resave: false,
    saveUninitialized: false,
  })
);

// BYPASS PROTECTION GLOBAL
app.use((req, res, next) => {
  const publicPaths = [
    "/login.html",
    "/login",
    "/login-broker",
    "/cssFolder",
    "/jsScript",
    "/uploads",
    "/public"
  ];

  const isPublic = req.path === "/" || publicPaths.some(path => req.path.startsWith(path));

  if (isPublic) return next();

  if (!req.session.user) {
    return res.redirect("/");
  }

  next();
});

// 🔥 STATIC TARUH DI BAWAH (WAJIB!)
app.use(express.static(__dirname));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ========== multer =======
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage
});

// ====================== ROUTE =========================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// ====================== DATABASE ======================
const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "db_smart-saga(new)",
};

// ====================== MQTT ======================
const mqttConfig = {
  mqtt_server: "d4074ff835754387b943f21e95168512.s1.eu.hivemq.cloud",
  mqtt_port: 8883,
  mqtt_user: "school-absensi",
  mqtt_password: "School12",
  mqtt_topic: "absensi/rfid",
};

let mqttClient = null;

function initMQTT() {
  try {
    console.log("🚀 Connecting to:", mqttConfig.mqtt_server);

    const options = {
      host: mqttConfig.mqtt_server,
      port: mqttConfig.mqtt_port,
      username: mqttConfig.mqtt_user,
      password: mqttConfig.mqtt_password,
      protocol: "mqtts",
    };

    mqttClient = mqtt.connect(options);

    const topic = mqttConfig.mqtt_topic.trim();

    mqttClient.on("connect", () => {
      console.log("✅ MQTT Connected");

      mqttClient.subscribe(topic, (err) => {
        if (err) {
          console.error("❌ Subscribe gagal:", err.message);
        } else {
          console.log("📥 SUBSCRIBE:", topic);
        }
      });
    });

    // ==================== handle massage dan setingan jam ==========
    mqttClient.on("message", async (topic, message) => {
      let db = null;
      try {
        const payload = JSON.parse(message.toString());
        if (!payload?.rf_id) return;

        db = await mysql.createConnection(dbConfig);

        // Ambil setting jam
        const [[setting]] = await db.execute(`
      SELECT jam_masuk, jam_pulang FROM setting_jam LIMIT 1
    `);

        const now = new Date();
        const jamSekarang = now.toTimeString().slice(0, 8);

        // Cek sudah ada absen hari ini atau belum
        const [cek] = await db.execute(`
      SELECT * FROM absensi_log
      WHERE card_uid = ? AND DATE(tanggal) = CURDATE()
    `, [payload.rf_id]);

        // ======================
        // ✅ BELUM ABSEN → MASUK
        // ======================
        if (cek.length === 0) {
          await db.execute(`
        INSERT INTO absensi_log
        (card_uid, mac, tanggal, jam_masuk, status)
        VALUES (?, ?, CURDATE(), ?, 'Hadir')
      `, [payload.rf_id, payload.mac, jamSekarang]);

          console.log("✅ MASUK:", payload.rf_id);
        }

        // ======================
        // ✅ SUDAH ABSEN → CEK PULANG
        // ======================
        else {
          // ❌ BELUM WAKTU PULANG
          if (jamSekarang < setting.jam_pulang) {
            console.log("🚫 hey jangan bolos!!");

            // optional kirim ke mqtt device / buzzer
            mqttClient.publish("absensi/notif", JSON.stringify({
              message: "hey jangan bolos!!"
            }));

            return;
          }

          // ✅ UPDATE JADI PULANG
          await db.execute(`
        UPDATE absensi_log
        SET jam_masuk = ?, status = 'Pulang'
        WHERE card_uid = ? AND DATE(tanggal) = CURDATE()
      `, [jamSekarang, payload.rf_id]);

          console.log("🏁 PULANG:", payload.rf_id);
        }

      } catch (err) {
        console.error("MQTT ERROR:", err.message);
      } finally {
        if (db) await db.end();
      }
    });

  } catch (err) {
    console.error("INIT MQTT ERROR:", err.message);
  }
}

async function reconnectMQTT() {
  initMQTT();
}

// ======================  LOGIN ======================
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username dan password wajib diisi"
      });
    }

    const db = await mysql.createConnection(dbConfig);
    const [rows] = await db.execute(
      `SELECT u.id, u.username, u.password, r.roles AS role
       FROM users u
       JOIN roles r ON u.roles_id = r.id
       WHERE u.username = ?`,
      [username]
    );
    await db.end();

    if (!rows.length) {
      return res.status(400).json({ success: false, message: "User tidak ditemukan" });
    }

    const user = rows[0];

    // Hybrid check: hash bcrypt atau plain text
    let isMatch = false;
    if (user.password.startsWith('$2b$') || user.password.startsWith('$2a$')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = (password === user.password);
    }

    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Password salah" });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    return res.json({ success: true, message: "Login berhasil", role: user.role });

  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan pada server" });
  }
});

// ====================== BROKER CONFIG ======================
app.post("/login-broker", async (req, res) => {
  const { user, password } = req.body;

  try {
    const db = await mysql.createConnection(dbConfig);
    const [rows] = await db.execute(
      "SELECT * FROM broker_config WHERE user=? AND password=? LIMIT 1",
      [user, password]
    );
    await db.end();

    if (!rows.length) {
      return res.send(`
        <script>
          alert("Konsfigurasi Broker Salah!");
          window.location.href="/";
        </script>
      `);
    }

    const broker = rows[0];
    mqttConfig.mqtt_user = broker.user;
    mqttConfig.mqtt_password = broker.password;
    mqttConfig.mqtt_server = broker.host;

    if (mqttClient) mqttClient.end(true);
    initMQTT();

    res.redirect("/admin/admin.html");
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// ======================= setting jam admin ==================
// GET setting jam
app.get("/api/setting-jam", async (req, res) => {
  const db = await mysql.createConnection(dbConfig);
  const [[data]] = await db.execute(`SELECT * FROM setting_jam LIMIT 1`);
  await db.end();
  res.json(data);
});

// UPDATE setting jam
app.post("/api/setting-jam", auth("admin"), async (req, res) => {
  const { jam_masuk, jam_pulang } = req.body;

  const db = await mysql.createConnection(dbConfig);

  await db.execute(`
    UPDATE setting_jam
    SET jam_masuk=?, jam_pulang=?
    WHERE id=1
  `, [jam_masuk, jam_pulang]);

  await db.end();

  res.json({ message: "Setting jam berhasil diupdate" });
});

//=================== management pengguna =====================
// ----- GET all users -----
app.get("/admin/management_users", auth("admin"), async (req, res) => {
  try {
    const db = await mysql.createConnection(dbConfig);
    const [rows] = await db.execute(`
      SELECT 
        u.id,
        u.username,
        u.password,
        r.roles AS role
      FROM users u
      JOIN roles r ON u.roles_id = r.id
      ORDER BY u.id DESC
    `);
    await db.end();

    res.json(rows);

  } catch (err) {
    console.error("ERROR MANAGEMENT USERS:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// UPDATE
app.put("/admin/management_users/:id", auth("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, roles_id } = req.body;

    const db = await mysql.createConnection(dbConfig);

    if (password && password.trim() !== "") {
      const hashed = await bcrypt.hash(password, 10);

      await db.execute(
        "UPDATE users SET username=?, password=?, roles_id=? WHERE id=?",
        [username, hashed, roles_id, id]
      );
    } else {
      await db.execute(
        "UPDATE users SET username=?, roles_id=? WHERE id=?",
        [username, roles_id, id]
      );
    }

    await db.end();

    res.json({ message: "User berhasil diupdate" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE
app.delete("/admin/management_users/:id", auth("admin"), async (req, res) => {
  try {
    const { id } = req.params;

    const db = await mysql.createConnection(dbConfig);

    await db.execute("DELETE FROM users WHERE id=?", [id]);

    await db.end();

    res.json({ message: "User berhasil dihapus" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ======================= api lastest =========================
app.get("/api/latest", async (req, res) => {
  try {
    const db = await mysql.createConnection(dbConfig);

    const [rows] = await db.execute(`
      SELECT a.card_uid, m.nama, m.kelas, a.jam_masuk, a.tanggal, a.status
      FROM absensi_log a
      LEFT JOIN data_mapping m ON a.card_uid = m.card_uid
      ORDER BY a.id DESC
      LIMIT 5
    `);

    await db.end();

    res.json(rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ====================== STATISTIK DASHBOARD ======================
app.get("/api/statistik", async (req, res) => {
  try {
    const db = await mysql.createConnection(dbConfig);

    const [rows] = await db.execute(`
      SELECT
        COUNT(*) AS total,

        SUM(CASE WHEN a.status = 'Hadir' THEN 1 ELSE 0 END) AS hadir,
        SUM(CASE WHEN a.status = 'Alpha' THEN 1 ELSE 0 END) AS alpha,
        SUM(CASE WHEN a.status = 'Telat' THEN 1 ELSE 0 END) AS telat,

        -- IZIN dari tabel perizinan (hari ini & disetujui)
        (
          SELECT COUNT(*)
          FROM perizinan p
          WHERE p.status = 'disetujui'
          AND DATE(p.created_at) = CURDATE()
        ) AS izin

      FROM absensi_log a
      WHERE DATE(a.tanggal) = CURDATE()
    `);

    await db.end();

    const data = rows[0];

    // hitung persentase hadir
    let persentase = 0;
    if (data.total > 0) {
      persentase = ((data.hadir / data.total) * 100).toFixed(1);
    }

    res.json({
      hadir: data.hadir || 0,
      izin: data.izin || 0,
      alpha: data.alpha || 0,
      telat: data.telat || 0,
      persentase
    });

  } catch (err) {
    console.error("STATISTIK ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

//============ logout =======================================\
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("ERROR LOGOUT:", err);
      return res.status(500).json({ message: "Server error" });
    }
    res.json({ message: "Logout berhasil" });
  });
});


// ======================== tambah kartu ======================
app.post("/api/kartu", auth("admin"), async (req, res) => {
  try {
    const db = await mysql.createConnection(dbConfig);
    const { card_uid, nama, kelas } = req.body;

    await db.execute(`
      INSERT INTO data_mapping(card_uid, nama, kelas) VALUES (?, ?, ?)`,
      [card_uid, nama, kelas]);

    await db.end();

    res.json({
      success: true,
      message: "Kartu berhasil ditambahkan"
    });

  } catch (err) {
    console.error("ERROR TAMBAH KARTU:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ====================== ABSEN MANUAL ======================
app.post("/api/absen-manual", async (req, res) => {
  try {
    const { nama } = req.body;

    if (!nama) {
      return res.status(400).json({ message: "Nama wajib diisi" });
    }

    const db = await mysql.createConnection(dbConfig);

    // 🔍 ambil card_uid
    const [user] = await db.execute(
      "SELECT card_uid FROM data_mapping WHERE nama = ? LIMIT 1",
      [nama]
    );

    if (!user.length) {
      await db.end();
      return res.status(404).json({ message: "Nama tidak ditemukan" });
    }

    const card_uid = user[0].card_uid;

    // 🔥 ambil setting jam
    const [[setting]] = await db.execute(`
      SELECT jam_masuk, jam_pulang FROM setting_jam LIMIT 1
    `);

    const now = new Date();
    const jamSekarang = now.toTimeString().slice(0, 8);

    // 🔍 cek sudah absen hari ini
    const [cek] = await db.execute(`
      SELECT * FROM absensi_log
      WHERE card_uid = ? AND DATE(tanggal) = CURDATE()
    `, [card_uid]);

    // ======================
    // ✅ BELUM ABSEN → MASUK
    // ======================
    if (cek.length === 0) {

      await db.execute(`
        INSERT INTO absensi_log
        (card_uid, mac, tanggal, jam_masuk, status)
        VALUES (?, 'MANUAL', CURDATE(), ?, 'Hadir')
      `, [card_uid, jamSekarang]);

      await db.end();
      return res.json({
        success: true,
        type: "masuk",
        message: "Absen masuk berhasil"
      });
    }

    // ======================
    // ❌ BELUM JAM PULANG
    // ======================
    if (jamSekarang < setting.jam_pulang) {
      await db.end();
      return res.status(400).json({
        success: false,
        message: "hey jangan bolos!!"
      });
    }

    // ======================
    // ✅ UPDATE JADI PULANG
    // ======================
    await db.execute(`
      UPDATE absensi_log
      SET jam_masuk = ?, status = 'Pulang'
      WHERE card_uid = ? AND DATE(tanggal) = CURDATE()
    `, [jamSekarang, card_uid]);

    await db.end();

    return res.json({
      success: true,
      type: "pulang",
      message: "Absen pulang berhasil"
    });

  } catch (err) {
    console.error("ABSEN MANUAL ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/absensi-rekap", async (req, res) => {
  try {
    const { bulan, tahun } = req.query;

    const db = await mysql.createConnection(dbConfig);

    let query = `
      SELECT a.*, m.nama, m.kelas
      FROM absensi_log a
      LEFT JOIN data_mapping m ON a.card_uid = m.card_uid
      WHERE 1=1
    `;

    let params = [];

    // 🔥 filter tahun (opsional)
    if (tahun && tahun !== "0") {
      query += ` AND YEAR(a.tanggal) = ?`;
      params.push(tahun);
    }

    // 🔥 filter bulan (opsional)
    if (bulan && bulan !== "0") {
      query += ` AND MONTH(a.tanggal) = ?`;
      params.push(bulan);
    }

    query += ` ORDER BY a.tanggal DESC`;

    const [rows] = await db.execute(query, params);

    await db.end();
    res.json(rows);

  } catch (err) {
    console.error("REKAP ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

//======================= tambah user ==========================
app.post("/api/users", async (req, res) => {
  try {
    const { username, password, roles_id } = req.body;

    if (!username || !password || !roles_id) {
      return res.status(400).json({
        success: false,
        message: "Semua field wajib diisi"
      });
    }

    const db = await mysql.createConnection(dbConfig);
    const hashed = await bcrypt.hash(password, 10);

    await db.execute(
      "INSERT INTO users (username, password, roles_id) VALUES (?, ?, ?)",
      [username, hashed, roles_id]
    );

    await db.end();

    res.json({
      success: true,
      message: "User berhasil ditambahkan"
    });

  } catch (err) {
    console.error("ERROR TAMBAH USER:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ========================= api perizinan for admin =================
app.all("/api/perizinan/manage", async (req, res) => {
  try {
    const db = await mysql.createConnection(dbConfig);

    // ===================== GET (AMBIL DATA) =====================
    if (req.method === "GET") {
      const [rows] = await db.execute(`
        SELECT 
          id,
          nama_siswa,
          kelas_siswa,
          alasan,
          bukti,
          status,
          created_at
        FROM perizinan
        ORDER BY created_at DESC
      `);

      await db.end();
      return res.json(rows);
    }

    // ===================== POST (UPDATE STATUS) =====================
    if (req.method === "POST") {
      const { id, status } = req.body;

      if (!id || !status) {
        await db.end();
        return res.status(400).json({ message: "ID & status wajib diisi" });
      }

      if (!["disetujui", "ditolak"].includes(status)) {
        await db.end();
        return res.status(400).json({ message: "Status tidak valid" });
      }

      await db.execute(
        "UPDATE perizinan SET status=? WHERE id=?",
        [status, id]
      );

      await db.end();

      return res.json({
        success: true,
        message: `Status berhasil diubah menjadi ${status}`
      });
    }

    await db.end();
    res.status(405).json({ message: "Method tidak diizinkan" });

  } catch (err) {
    console.error("PERIZINAN API ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ====================== API PERIZINAN ======================
app.get("/api/riwayatperizinan", async (req, res) => {
  try {
    const db = await mysql.createConnection(dbConfig);

    const [rows] = await db.execute(`
      SELECT 
        id,
        nama_siswa, 
        kelas_siswa, 
        alasan, 
        bukti,
        status, 
        created_at 
      FROM perizinan
      ORDER BY created_at DESC
    `);

    await db.end();

    res.json(rows);

  } catch (err) {
    console.error("GET ALL ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/riwayatperizinan/:id", async (req, res) => {
  try {
    const db = await mysql.createConnection(dbConfig);
    const id = req.params.id;

    const [rows] = await db.execute(`
      SELECT 
        id,
        nama_siswa, 
        kelas_siswa, 
        alasan, 
        bukti,
        status, 
        created_at 
      FROM perizinan 
      WHERE id = ?
    `, [id]);

    await db.end();

    if (rows.length === 0) {
      return res.status(404).json({ message: "Data tidak ditemukan" });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("GET BY ID ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ====================== ABSENSI ======================
app.get("/api/absensi", async (req, res) => {
  let db = null;
  try {
    db = await mysql.createConnection(dbConfig);

    const [rows] = await db.execute(`
      SELECT a.card_uid, m.nama, m.kelas,
             a.mac, a.tanggal, a.jam_masuk, a.status
      FROM absensi_log a
      LEFT JOIN data_mapping m ON a.card_uid = m.card_uid
      ORDER BY a.id DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("GET ABSENSI ERROR:", err);
    res.status(500).json({ message: "Server error" });
  } finally {
    if (db) await db.end();
  }
});

// ============ persentase =======
app.get("/api/persentase", async (req, res) => {
  try {
    const db = await mysql.createConnection(dbConfig);

    // total siswa
    const [[total]] = await db.execute(`
      SELECT COUNT(*) as total FROM data_mapping
    `);

    // hadir dari absensi_log
    const [[hadir]] = await db.execute(`
      SELECT COUNT(DISTINCT card_uid) as hadir 
      FROM absensi_log 
      WHERE tanggal = CURDATE()
    `);

    // izin dari perizinan
    const [[izin]] = await db.execute(`
      SELECT COUNT(*) as izin 
      FROM perizinan 
      WHERE status = 'disetujui' AND alasan = 'izin'
    `);

    // sakit dari perizinan
    const [[sakit]] = await db.execute(`
      SELECT COUNT(*) as sakit 
      FROM perizinan 
      WHERE status = 'disetujui' AND alasan = 'sakit'
    `);

    await db.end();

    const totalSiswa = total.total || 0;
    const hadirCount = hadir.hadir || 0;
    const izinCount = izin.izin || 0;
    const sakitCount = sakit.sakit || 0;

    // hitung alpha
    const alphaCount = totalSiswa - (hadirCount + izinCount + sakitCount);

    // persen hadir
    const persen_hadir = totalSiswa
      ? Math.round((hadirCount / totalSiswa) * 100)
      : 0;

    res.json({
      persen_hadir,
      jumlah_izin: izinCount,
      jumlah_sakit: sakitCount,
      jumlah_alpha: alphaCount < 0 ? 0 : alphaCount
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ====================== API PERIZINAN ======================
app.get("/api/riwayatperizinan/:id", async (req, res) => {
  try {
    const db = await mysql.createConnection(dbConfig);
    const id = req.params.id;

    const [rows] = await db.execute(`
      SELECT 
        nama_siswa, 
        kelas_siswa, 
        alasan, 
        bukti,
        status, 
        created_at 
      FROM perizinan 
      WHERE id = ?
    `, [id]);

    await db.end();

    if (rows.length === 0) {
      return res.status(404).json({ message: "Data tidak ditemukan" });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

//========== api kirim izin ==============
app.post("/api/perizinan", upload.single("bukti"), async (req, res) => {
  try {
    const { nama_siswa, kelas_siswa, alasan } = req.body;
    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User belum login"
      });
    }

    if (!nama_siswa || !kelas_siswa || !alasan) {
      return res.status(400).json({
        success: false,
        message: "Semua field wajib diisi"
      });
    }

    const bukti = req.file ? req.file.filename : null;

    const db = await mysql.createConnection(dbConfig);

    await db.execute(`
      INSERT INTO perizinan 
      (user_id, nama_siswa, kelas_siswa, alasan, bukti, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', NOW())
    `, [userId, nama_siswa, kelas_siswa, alasan, bukti]);

    await db.end();

    res.json({
      success: true,
      message: "Pengajuan izin berhasil"
    });

  } catch (err) {
    console.error("ERROR KIRIM IZIN:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ====================== API EXPORT EXCEL ======================
app.get("/api/export_excel", async (req, res) => {
  try {
    // Cek session admin
    if (!req.session.user || req.session.user.role !== "admin") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const db = await mysql.createConnection(dbConfig);

    // Ambil data absensi + mapping nama & kelas
    const [rows] = await db.execute(`
      SELECT d.nama, d.kelas, a.card_uid, a.mac, a.tanggal, a.jam_masuk AS jam, a.status
      FROM absensi_log a
      LEFT JOIN data_mapping d ON a.card_uid = d.card_uid
      ORDER BY a.tanggal DESC, a.jam_masuk DESC
    `);

    await db.end();

    // Buat workbook Excel
    const workbook = new ExcelJs.Workbook();
    const worksheet = workbook.addWorksheet("Data Absensi");

    // Buat header kolom
    worksheet.columns = [
      { header: "No", key: "no", width: 5 },
      { header: "Nama", key: "nama", width: 25 },
      { header: "Kelas", key: "kelas", width: 15 },
      { header: "MAC", key: "mac", width: 25 },
      { header: "Tanggal", key: "tanggal", width: 15 },
      { header: "Jam Masuk", key: "jam", width: 15 },
      { header: "Status", key: "status", width: 15 },
    ];

    worksheet.getRow(1).font = { bold: true };

    // Isi data ke Excel
    rows.forEach((row, index) => {
      worksheet.addRow({
        no: index + 1,
        nama: row.nama || "-",
        kelas: row.kelas || "-",
        mac: row.mac,
        tanggal: row.tanggal,
        jam: row.jam,
        status: row.status,
      });
    });

    // Set header response supaya browser download file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=absensi.xlsx"
    );

    // Kirim workbook
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("EXPORT EXCEL ERROR:", err.message);
    res.status(500).json({ message: "Gagal export data Excel" });
  }
});

// ====================== EXPORT EXCEL BULANAN ======================
app.get("/api/export_excelBulan", auth("admin"), async (req, res) => {
  try {
    const bulan = parseInt(req.query.bulan) || new Date().getMonth() + 1;
    const tahun = parseInt(req.query.tahun) || new Date().getFullYear();

    const db = await mysql.createConnection(dbConfig);

    const [rows] = await db.execute(`
      SELECT 
        m.nama,
        m.kelas,
        a.tanggal,
        a.jam_masuk,
        a.status
      FROM absensi_log a
      LEFT JOIN data_mapping m ON a.card_uid = m.card_uid
      WHERE MONTH(a.tanggal) = ? AND YEAR(a.tanggal) = ?
      ORDER BY a.tanggal DESC
    `, [bulan, tahun]);

    await db.end();

    const workbook = new ExcelJs.Workbook();
    const sheet = workbook.addWorksheet("Rekap Bulanan");

    sheet.columns = [
      { header: "Nama", key: "nama", width: 25 },
      { header: "Kelas", key: "kelas", width: 15 },
      { header: "Tanggal", key: "tanggal", width: 20 },
      { header: "Jam", key: "jam_masuk", width: 15 },
      { header: "Status", key: "status", width: 15 },
    ];

    rows.forEach(r => {
      sheet.addRow({
        nama: r.nama || "-",
        kelas: r.kelas || "-",
        tanggal: new Date(r.tanggal).toLocaleDateString("id-ID"),
        jam_masuk: r.jam_masuk,
        status: r.status
      });
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=rekap-${bulan}-${tahun}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("EXPORT ERROR:", err.message);
    res.status(500).json({ message: "Export gagal" });
  }
});

// ====================== START SERVER ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server jalan di port", PORT);
});