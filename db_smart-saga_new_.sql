-- phpMyAdmin SQL Dump
-- version 5.2.0
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Apr 17, 2026 at 09:29 AM
-- Server version: 10.4.27-MariaDB
-- PHP Version: 8.1.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `db_smart-saga(new)`
--

-- --------------------------------------------------------

--
-- Table structure for table `absensi_log`
--

CREATE TABLE `absensi_log` (
  `id` int(11) NOT NULL,
  `card_uid` varchar(100) NOT NULL,
  `mac` varchar(100) NOT NULL,
  `tanggal` date NOT NULL,
  `jam_masuk` time NOT NULL,
  `status` enum('Hadir','Telat','Pulang','Alpha') DEFAULT 'Hadir',
  `lokasi` varchar(100) DEFAULT NULL,
  `nama` varchar(100) DEFAULT NULL,
  `jam_pulang` time DEFAULT NULL,
  `id_nama` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `absensi_log`
--

INSERT INTO `absensi_log` (`id`, `card_uid`, `mac`, `tanggal`, `jam_masuk`, `status`, `lokasi`, `nama`, `jam_pulang`, `id_nama`) VALUES
(406, '0x27 0x52 0xC1 0x63 ', '', '2026-04-16', '12:57:36', 'Hadir', 'Tidak dikenal', 'Tidak dikenal', NULL, NULL),
(407, '0x4A 0xF1 0x72 0x1A ', '', '2026-04-16', '13:05:42', 'Pulang', 'Tidak dikenal', 'Tidak dikenal', NULL, NULL),
(408, '0x2a 0x0f 0x8f 0x19', 'MANUAL', '2026-04-16', '14:30:25', 'Hadir', 'Tidak dikenal', 'Tidak dikenal', NULL, NULL),
(409, '0x8a 0x96 0x8f 0x19', 'MANUAL', '2026-04-16', '14:31:23', 'Hadir', 'Tidak dikenal', 'Tidak dikenal', NULL, NULL),
(410, '0xba 0x5e 0x8c 0x19', 'MANUAL', '2026-04-16', '14:57:49', 'Hadir', 'Tidak dikenal', 'Tidak dikenal', NULL, NULL);

--
-- Triggers `absensi_log`
--
DELIMITER $$
CREATE TRIGGER `isi_lokasi` BEFORE INSERT ON `absensi_log` FOR EACH ROW BEGIN
    DECLARE loc VARCHAR(50);

    -- cek apakah MAC ada di tabel data_mapping
    SELECT lokasi INTO loc
    FROM data_mapping
    WHERE mac = NEW.mac
    LIMIT 1;

    -- kalau ketemu isi lokasi, kalau nggak kasih default "Tidak dikenal"
    SET NEW.lokasi = IFNULL(loc, 'Tidak dikenal');
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `isi_lokasi_nama` BEFORE INSERT ON `absensi_log` FOR EACH ROW BEGIN
    DECLARE loc VARCHAR(50);
    DECLARE nm VARCHAR(50);

    -- cek apakah MAC ada di tabel data_mapping
    SELECT lokasi, nama INTO loc, nm
    FROM data_mapping
    WHERE mac = NEW.mac
    LIMIT 1;

    -- isi data, default = "Tidak dikenal" kalau tidak ada
    SET NEW.lokasi = IFNULL(loc, 'Tidak dikenal');
    SET NEW.nama = IFNULL(nm, 'Tidak dikenal');
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `broker_config`
--

CREATE TABLE `broker_config` (
  `id` int(11) NOT NULL,
  `user` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `host` varchar(255) NOT NULL,
  `port` int(11) DEFAULT 1883,
  `virtual_host` varchar(100) NOT NULL,
  `queue_device` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `broker_config`
--

INSERT INTO `broker_config` (`id`, `user`, `password`, `host`, `port`, `virtual_host`, `queue_device`, `created_at`) VALUES
(38, 'school-absensi', 'School12', 'd4074ff835754387b943f21e95168512.s1.eu.hivemq.cloud', 1883, 'absensi/rfid', 'absensi/control', '2026-02-27 02:31:04');

-- --------------------------------------------------------

--
-- Table structure for table `data_mapping`
--

CREATE TABLE `data_mapping` (
  `id` int(11) NOT NULL,
  `card_uid` varchar(50) NOT NULL,
  `nama` varchar(100) NOT NULL,
  `lokasi` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `mac` varchar(225) DEFAULT NULL,
  `kelas` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `data_mapping`
--

INSERT INTO `data_mapping` (`id`, `card_uid`, `nama`, `lokasi`, `created_at`, `mac`, `kelas`) VALUES
(1, '0x8a 0x96 0x8f 0x19', 'Muhamad Arif Billah', 'Gedung A', '2025-09-29 02:52:49', NULL, NULL),
(2, '0x4a 0xf1 0x72 0x1a', 'Niki Abdul Jaelani', 'Gedung A', '2025-09-29 02:52:49', NULL, 'XII RPL 1'),
(3, '0xaa 0xb6 0x89 0x19', 'Muhamad Rafi Ardiansyah', 'Gedung A', '2025-09-29 02:53:36', NULL, NULL),
(4, '0xba 0x5e 0x8c 0x19', 'Muhammad Farhan ', 'Gedung A', '2025-09-29 03:55:28', NULL, NULL),
(5, '0x2a 0x0f 0x8f 0x19', 'Ridwan Irwansyah', 'Gedung A', '2025-09-29 03:57:09', NULL, NULL),
(6, '0x4a 0xd9 0x98 0x19 ', 'Mulqi Faturrahman', 'Gedung A', '2025-09-29 03:59:22', NULL, NULL),
(13, '12345644', 'Fani', NULL, '2026-03-30 16:11:42', NULL, '9 G'),
(14, '12345', 'Fani', NULL, '2026-03-30 16:45:14', NULL, 'Hebat'),
(15, '6667777998', 'Wildan', NULL, '2026-04-01 06:08:43', NULL, 'XII-RPL-1'),
(17, '0x27 0x52 0xC1 0x63 ', 'pa adang', NULL, '2026-04-16 05:56:57', NULL, 'XII-RPL-1');

-- --------------------------------------------------------

--
-- Table structure for table `perizinan`
--

CREATE TABLE `perizinan` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `nama_siswa` varchar(100) NOT NULL,
  `kelas_siswa` varchar(50) NOT NULL,
  `alasan` text NOT NULL,
  `bukti` varchar(255) DEFAULT NULL,
  `status` enum('pending','disetujui','ditolak') DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `perizinan`
--

INSERT INTO `perizinan` (`id`, `user_id`, `nama_siswa`, `kelas_siswa`, `alasan`, `bukti`, `status`, `created_at`) VALUES
(18, 17, 'Kiki', '10 RPL 1', 'sakit', '1775917537290.png', 'disetujui', '2026-04-11 14:25:37'),
(19, 2, 'Niki', '11 RPL 3', 'Sakit', '1776319248771.png', 'disetujui', '2026-04-16 06:00:48');

-- --------------------------------------------------------

--
-- Table structure for table `roles`
--

CREATE TABLE `roles` (
  `id` int(11) NOT NULL,
  `roles` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `roles`
--

INSERT INTO `roles` (`id`, `roles`) VALUES
(1, 'admin'),
(3, 'murid'),
(2, 'user');

-- --------------------------------------------------------

--
-- Table structure for table `setting_jam`
--

CREATE TABLE `setting_jam` (
  `id` int(11) NOT NULL,
  `jam_masuk` time DEFAULT NULL,
  `jam_pulang` time DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `setting_jam`
--

INSERT INTO `setting_jam` (`id`, `jam_masuk`, `jam_pulang`) VALUES
(1, '01:00:00', '13:03:00');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(225) NOT NULL,
  `password` varchar(20) NOT NULL,
  `roles_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `password`, `roles_id`) VALUES
(1, 'Niki', 'Nikks11', 1),
(2, 'Rafi', 'Raffs221', 2),
(9, 'Rifaldo', 'Riffals13', 1),
(15, 'Adhyasta', 'Dhyass14', 3),
(16, 'Fani', '9gClass', 1),
(17, 'Kiki', '$2b$10$ADK3/v0KkMP.E', 2),
(18, 'Fakhri', '$2b$10$zq0H5Lb9XpTJy', 1);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `absensi_log`
--
ALTER TABLE `absensi_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `id_nama` (`id_nama`);

--
-- Indexes for table `broker_config`
--
ALTER TABLE `broker_config`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `data_mapping`
--
ALTER TABLE `data_mapping`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `card_uid` (`card_uid`);

--
-- Indexes for table `perizinan`
--
ALTER TABLE `perizinan`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `roles` (`roles`);

--
-- Indexes for table `setting_jam`
--
ALTER TABLE `setting_jam`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD KEY `roles_id` (`roles_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `absensi_log`
--
ALTER TABLE `absensi_log`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=411;

--
-- AUTO_INCREMENT for table `broker_config`
--
ALTER TABLE `broker_config`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=39;

--
-- AUTO_INCREMENT for table `data_mapping`
--
ALTER TABLE `data_mapping`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

--
-- AUTO_INCREMENT for table `perizinan`
--
ALTER TABLE `perizinan`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `roles`
--
ALTER TABLE `roles`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `setting_jam`
--
ALTER TABLE `setting_jam`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `absensi_log`
--
ALTER TABLE `absensi_log`
  ADD CONSTRAINT `id_nama` FOREIGN KEY (`id_nama`) REFERENCES `data_mapping` (`id`);

--
-- Constraints for table `perizinan`
--
ALTER TABLE `perizinan`
  ADD CONSTRAINT `perizinan_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `users_ibfk_1` FOREIGN KEY (`roles_id`) REFERENCES `roles` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
