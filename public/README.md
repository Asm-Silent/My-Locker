# My Locker - Secure Student Productivity Platform

## Business Name and Description
* **Business Name:** My Locker Inc.
* **Description:** A secure, all-in-one digital student productivity and file-management platform. It is designed for college and university students to store files, take quick notes, organize academic schedules with an interactive calendar, stream study music, and collaborate with peers through friend requests, real-time file sharing, and peer-to-peer messaging.
* **Target Users:** Students and academic researchers who need a unified, distraction-free workspace.

## Problem Being Solved
Students frequently juggle multiple scattered tools for school work—cloud storage accounts, separate note-taking apps, calendars, music players, and messaging apps. "My Locker" solves this fragmentation by consolidating file management, scheduling, quick reminders, and peer collaboration into a single, cohesive, secure dashboard with dark/light theme support.

## Feature List
* **Authentication:** Secure user registration, password hashing (bcrypt), login, and session-based logout.
* **File Management (CRUD):** Complete Create, Read, Update/Star, and Delete operations for documents, assignments, code repositories, and media files with drag-and-drop support.
* **Quick Notes:** Persistent sticky notes widget for rapid reminders.
* **Interactive Calendar & Event Reminders:** Clickable date modal allowing users to add and manage exam due dates and academic events with visual indicator badges.
* **Study Radio:** Integrated lofi music streaming player for focused study sessions.
* **Social & Collaboration:** * User search by name or email.
  * Friend requests with real-time notification badges.
  * Peer-to-peer file sharing permissions.
  * Direct chat and file request messaging system between connected friends.

## Tech Stack Used
* **Backend:** Node.js, Express.js
* **Database:** SQLite3 (Relational schema covering users, files, notes, calendar events, friendships, shared files, and messages)
* **Authentication & Security:** Express-Session, Bcrypt
* **File Uploads:** Multer
* **Frontend:** HTML5, Tailwind CSS (with dynamic Dark/Light Mode)

## Setup and Run Instructions (Tested from a Clean Machine)
To run this project locally, ensure you have **Node.js** installed on your machine.

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/Asm-Silent/My-Locker.git](https://github.com/Asm-Silent/My-Locker.git)
   cd My-Locker