-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 03, 2026 at 10:30 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `db_mislend`
--

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `users_id` varchar(255) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `firstName` varchar(255) DEFAULT NULL,
  `middleInitial` varchar(10) DEFAULT NULL,
  `lastName` varchar(255) DEFAULT NULL,
  `role` varchar(50) NOT NULL DEFAULT 'student',
  `status` varchar(50) NOT NULL DEFAULT 'approved',
  `studentId` varchar(100) DEFAULT NULL,
  `student_id` varchar(100) DEFAULT NULL,
  `facultyId` varchar(100) DEFAULT NULL,
  `faculty_id` varchar(100) DEFAULT NULL,
  `adminId` varchar(100) DEFAULT NULL,
  `admin_id` varchar(100) DEFAULT NULL,
  `course` varchar(100) DEFAULT NULL,
  `department` varchar(150) DEFAULT NULL,
  `yearLevel` varchar(50) DEFAULT NULL,
  `section` varchar(50) DEFAULT NULL,
  `yearSection` varchar(100) DEFAULT NULL,
  `mobile` varchar(20) DEFAULT NULL,
  `gender` varchar(20) DEFAULT NULL,
  `photoURL` mediumtext DEFAULT NULL,
  `isHeadAdmin` tinyint(1) DEFAULT 0,
  `suspendedAt` datetime DEFAULT NULL,
  `unsuspendedAt` datetime DEFAULT NULL,
  `createdAt` datetime DEFAULT current_timestamp(),
  `updatedAt` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `users_id`, `email`, `password`, `name`, `firstName`, `lastName`, `role`, `status`, `adminId`, `isHeadAdmin`) VALUES
(1, 'admin_demo_01', 'admin@cs1a.com', '$2a$10$yreAgMQUmBHnIfdwlsbK/eL1bkDKYmvPcW2NQ5aFV.0gBVcZtw7Qa', 'System Administrator', 'System', 'Administrator', 'admin', 'approved', 'admin', 1);

INSERT INTO `users` (`id`, `users_id`, `email`, `password`, `name`, `firstName`, `lastName`, `role`, `status`, `studentId`, `course`, `yearLevel`, `section`, `yearSection`, `mobile`, `gender`) VALUES
(2, 'student_demo_01', 'roshjingel@gmail.com', '$2a$10$1vPbKG/O.b1bFtBBeDtVO.ToZnIZFASWdGJnLG9PMmcA6sKzqZvM6', 'Rosh Jingel', 'Rosh', 'Jingel', 'student', 'approved', '20251234-S', 'BSCS', '1', 'A', '1-A', '09123456789', 'Male');

INSERT INTO `users` (`id`, `users_id`, `email`, `password`, `name`, `firstName`, `lastName`, `role`, `status`, `facultyId`, `department`, `mobile`, `gender`) VALUES
(3, 'prof_demo_01', 'prof@cs1a.com', '$2a$10$yreAgMQUmBHnIfdwlsbK/eL1bkDKYmvPcW2NQ5aFV.0gBVcZtw7Qa', 'Prof. Roberto Santos', 'Roberto', 'Santos', 'professor', 'approved', 'PROF-202501', 'Computer Studies', '09187654321', 'Male');

-- --------------------------------------------------------

--
-- Table structure for table `equipment`
--

CREATE TABLE `equipment` (
  `id` int(11) NOT NULL,
  `equipment_id` varchar(100) DEFAULT NULL,
  `equipmentId` varchar(100) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `category` varchar(100) DEFAULT NULL,
  `model` varchar(150) DEFAULT NULL,
  `serialNumber` varchar(150) DEFAULT NULL,
  `assetNumber` varchar(150) DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'available',
  `condition` varchar(50) DEFAULT 'Good',
  `location` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `photoURL` mediumtext DEFAULT NULL,
  `totalQuantity` int(11) DEFAULT 1,
  `availableQuantity` int(11) DEFAULT 1,
  `qrCode` mediumtext DEFAULT NULL,
  `createdAt` datetime DEFAULT current_timestamp(),
  `updatedAt` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `equipment`
--

INSERT INTO `equipment` (`id`, `equipment_id`, `equipmentId`, `name`, `category`, `model`, `serialNumber`, `assetNumber`, `status`, `condition`, `location`, `description`, `totalQuantity`, `availableQuantity`) VALUES
(1, 'eq_lap_01', 'AST-2025-001', 'Dell Latitude 5420 Laptop', 'Laptops', 'Latitude 5420', 'SN-DL-88231', 'AST-2025-001', 'available', 'Good', 'Lab 301, Cabinet A', 'Intel Core i5 11th Gen, 16GB RAM, 512GB SSD for programming laboratory sessions.', 5, 5),
(2, 'eq_proj_01', 'AST-2025-002', 'Epson EB-X06 Projector', 'Projectors', 'EB-X06 XGA 3600 Lumens', 'SN-EP-44109', 'AST-2025-002', 'available', 'Good', 'AVR Equipment Room', 'High brightness 3600-lumen XGA 3LCD projector with HDMI and VGA inputs.', 3, 3),
(3, 'eq_ard_01', 'AST-2025-003', 'Arduino Uno R3 Ultimate Starter Kit', 'Laboratory Kits', 'Uno R3 Kit v2', 'SN-ARD-10928', 'AST-2025-003', 'available', 'Good', 'Robotics & Embedded Lab', 'Complete microcontroller starter kit with breadboard, sensors, jumper wires, and LCD module.', 10, 10),
(4, 'eq_cam_01', 'AST-2025-004', 'Canon EOS 3000D DSLR Camera Kit', 'Audio/Visual', 'EOS 3000D + 18-55mm', 'SN-CN-76512', 'AST-2025-004', 'available', 'Good', 'Media Lab, Locker B', '18.0 MP APS-C CMOS sensor camera kit for multimedia projects and documentation.', 2, 2);

-- --------------------------------------------------------

--
-- Table structure for table `borrowings`
--

CREATE TABLE `borrowings` (
  `id` int(11) NOT NULL,
  `borrowings_id` varchar(100) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `equipment_id` int(11) DEFAULT NULL,
  `submissionId` varchar(100) DEFAULT NULL,
  `equipmentId` varchar(100) DEFAULT NULL,
  `equipmentName` varchar(255) DEFAULT NULL,
  `equipmentCategory` varchar(100) DEFAULT NULL,
  `userId` varchar(100) DEFAULT NULL,
  `userName` varchar(255) DEFAULT NULL,
  `userEmail` varchar(255) DEFAULT NULL,
  `userRole` varchar(50) DEFAULT NULL,
  `studentId` varchar(100) DEFAULT NULL,
  `facultyId` varchar(100) DEFAULT NULL,
  `borrowDate` varchar(50) DEFAULT NULL,
  `returnDate` varchar(50) DEFAULT NULL,
  `borrowTime` varchar(50) DEFAULT NULL,
  `expectedReturnTime` varchar(50) DEFAULT NULL,
  `actualReturnTime` varchar(50) DEFAULT NULL,
  `requestedReturnTime` varchar(50) DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'pending_borrow',
  `purpose` text DEFAULT NULL,
  `room` varchar(100) DEFAULT NULL,
  `subject` varchar(150) DEFAULT NULL,
  `professor` varchar(150) DEFAULT NULL,
  `conditionOnBorrow` varchar(100) DEFAULT NULL,
  `conditionOnReturn` varchar(100) DEFAULT NULL,
  `returnNotes` text DEFAULT NULL,
  `pendingReturnCondition` varchar(100) DEFAULT NULL,
  `pendingReturnNotes` text DEFAULT NULL,
  `extensionReason` text DEFAULT NULL,
  `studentIdPhoto` mediumtext DEFAULT NULL,
  `studentIdPhotoCapturedAt` datetime DEFAULT NULL,
  `studentIdPhotoCapturedBy` varchar(100) DEFAULT NULL,
  `studentIdPhotoCapturedByName` varchar(255) DEFAULT NULL,
  `borrowedAt` datetime DEFAULT NULL,
  `returnedAt` datetime DEFAULT NULL,
  `lastNotified` datetime DEFAULT NULL,
  `rejectionReason` text DEFAULT NULL,
  `wasOverdue` tinyint(1) DEFAULT 0,
  `hasExtension` tinyint(1) DEFAULT 0,
  `approvedBy` varchar(100) DEFAULT NULL,
  `approvedAt` datetime DEFAULT NULL,
  `releasedBy` varchar(100) DEFAULT NULL,
  `releasedByName` varchar(255) DEFAULT NULL,
  `releasedAt` datetime DEFAULT NULL,
  `extensionApprovedAt` datetime DEFAULT NULL,
  `extensionApprovedBy` varchar(100) DEFAULT NULL,
  `notificationCount` int(11) DEFAULT 0,
  `createdAt` datetime DEFAULT current_timestamp(),
  `updatedAt` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `incidents`
--

CREATE TABLE `incidents` (
  `id` int(11) NOT NULL,
  `incidents_id` varchar(100) DEFAULT NULL,
  `borrowing_id` int(11) DEFAULT NULL,
  `equipment_id` int(11) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `borrowingId` varchar(100) DEFAULT NULL,
  `equipmentId` varchar(100) DEFAULT NULL,
  `equipmentName` varchar(255) DEFAULT NULL,
  `reportedBy` varchar(100) DEFAULT NULL,
  `reporterName` varchar(255) DEFAULT NULL,
  `reporterEmail` varchar(255) DEFAULT NULL,
  `reporterRole` varchar(50) DEFAULT NULL,
  `type` varchar(100) DEFAULT NULL,
  `severity` varchar(50) DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'open',
  `description` text DEFAULT NULL,
  `photos` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`photos`)),
  `adminNotes` text DEFAULT NULL,
  `createdAt` datetime DEFAULT current_timestamp(),
  `updatedAt` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `approvedAt` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `messages`
--

CREATE TABLE `messages` (
  `id` int(11) NOT NULL,
  `messages_id` varchar(100) DEFAULT NULL,
  `incident_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `incidentId` varchar(100) NOT NULL,
  `senderId` varchar(100) NOT NULL,
  `senderName` varchar(255) DEFAULT NULL,
  `senderRole` varchar(50) DEFAULT NULL,
  `text` text NOT NULL,
  `timestamp` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `feedback`
--

CREATE TABLE `feedback` (
  `id` int(11) NOT NULL,
  `feedback_id` varchar(100) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `fullName` varchar(255) DEFAULT NULL,
  `role` varchar(50) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `overallRating` varchar(50) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'new-feedback',
  `timestamp` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `admin_audit_logs`
--

CREATE TABLE `admin_audit_logs` (
  `id` int(11) NOT NULL,
  `admin_audit_logs_id` varchar(100) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(255) DEFAULT NULL,
  `adminId` varchar(100) DEFAULT NULL,
  `targetUid` varchar(100) DEFAULT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `createdAt` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `users_id` (`users_id`),
  ADD KEY `studentId` (`studentId`);

--
-- Indexes for table `equipment`
--
ALTER TABLE `equipment`
  ADD PRIMARY KEY (`id`),
  ADD KEY `equipment_id` (`equipment_id`),
  ADD KEY `equipmentId` (`equipmentId`);

--
-- Indexes for table `borrowings`
--
ALTER TABLE `borrowings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `equipment_id` (`equipment_id`),
  ADD KEY `borrowings_id` (`borrowings_id`);

--
-- Indexes for table `incidents`
--
ALTER TABLE `incidents`
  ADD PRIMARY KEY (`id`),
  ADD KEY `borrowing_id` (`borrowing_id`),
  ADD KEY `equipment_id` (`equipment_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `messages`
--
ALTER TABLE `messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `incident_id` (`incident_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `feedback`
--
ALTER TABLE `feedback`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `admin_audit_logs`
--
ALTER TABLE `admin_audit_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `equipment`
--
ALTER TABLE `equipment`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `borrowings`
--
ALTER TABLE `borrowings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `incidents`
--
ALTER TABLE `incidents`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `messages`
--
ALTER TABLE `messages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `feedback`
--
ALTER TABLE `feedback`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `admin_audit_logs`
--
ALTER TABLE `admin_audit_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `borrowings`
--
ALTER TABLE `borrowings`
  ADD CONSTRAINT `borrowings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `borrowings_ibfk_2` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `incidents`
--
ALTER TABLE `incidents`
  ADD CONSTRAINT `incidents_ibfk_1` FOREIGN KEY (`borrowing_id`) REFERENCES `borrowings` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `incidents_ibfk_2` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `incidents_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `messages`
--
ALTER TABLE `messages`
  ADD CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`incident_id`) REFERENCES `incidents` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `feedback`
--
ALTER TABLE `feedback`
  ADD CONSTRAINT `feedback_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `admin_audit_logs`
--
ALTER TABLE `admin_audit_logs`
  ADD CONSTRAINT `admin_audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
