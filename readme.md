# 📦 SAP CAP & SAPUI5: Product & Supplier Management

A comprehensive, state-of-the-art CRUD application built with **SAP Cloud Application Programming Model (CAP)** and **Standalone SAPUI5**. This project follows the SAP Fiori Horizon design guidelines and implements advanced OData V4 patterns for a high-performance, seamless user experience.

---

## 🚀 Key Features

### 🔹 Advanced CRUD & Data Management
- **OData V4 Integration**: All data operations strictly use the OData V4 Model API with `updateGroupId` for optimized batch processing.
- **Inline Editing**: Live table editing with "Transient state" support—changes are kept in the UI and committed in a single batch.
- **Flexible Column Layout (FCL)**: Seamless Master-Detail navigation. List and details are displayed side-by-side with localized association views.
- **Batch Updates**: Create, update, and delete multiple records, then save them all with a single network request.

### 🔹 Intelligent CSV Motor
- **Custom CSV Parser**: Built from scratch without external libraries to ensure high performance and zero dependency conflicts.
- **Deep Validation UI**: A dedicated dialog displays row/column level errors returned from the backend before any data is committed.
- **Security & Integrity**: Schema-aware validation ensures data integrity during bulk uploads.

### 🔹 Pro UI/UX & Dark Mode
- **Premium Design**: Modern "Horizon" aesthetics with full support for **Dark Mode** and **Light Mode**.
- **Advanced Filtering**: Dynamic filtering logic (AND/OR) with a lazy-loaded condition builder fragment.
- **Routing Guards**: Prevents accidental data loss by warning users of unsaved changes when navigating away.
- **i18n Support**: Full localization for English (EN), Turkish (TR), and German (DE).

---

## 🛠 Technical Stack

- **Backend**: SAP CAP (Node.js)
- **Database**: SAP HANA Cloud (Local development via @cap-js/sqlite)
- **Frontend**: Standalone SAPUI5 (MVC Architecture)
- **Communication**: OData V4
- **Design System**: SAP Fiori Horizon

---

## 🏃 Getting Started

### Prerequisites
- Node.js (Latest LTS)
- SAP CDS SDK: `npm i -g @sap/cds-dk`

### Installation
```bash
# Clone the repository
git clone <repository-url>

# Install dependencies
npm install
```

### Running Locally
```bash
# Start backend and frontend simultaneously
cds watch

# For Hybrid profile (connected to HANA Cloud)
cds watch --profile hybrid
```

---

## 📁 Project Structure

- `app/`: Frontend artifacts (Views, Controllers, Fragments, i18n).
- `db/`: Data models and initial datasets (CSV).
- `srv/`: Service definitions and custom logic (CSV Parser, Validations).
- `readme.md`: This guide.

---

## 📝 Example CSV Files
Use the following files in the root directory to test the CSV Upload utility:
- `products_valid_example.csv`
- `suppliers_valid_example.csv`

---

