# PXP School Management System

A comprehensive school management platform built with React, TypeScript, and Supabase. This system provides a complete solution for managing students, staff, classrooms, libraries, branches, budgets, and generating administrative reports.

## Features

### User Management & Authentication
- **Secure Authentication**: Email/password authentication with Supabase
- **Role-Based Access Control**: Three user roles (Super Admin, Admin, Staff)
- **User Approval System**: New registrations require admin approval before access
- **Profile Management**: Users can update their personal information and documents

### Administrative Features
- **Dashboard**: Overview of system statistics including students, staff, classrooms, and books
- **User Approvals**: Admins can approve or reject pending user registrations
- **Staff Management**: Create, view, update, and delete staff members with document upload
- **Student Management**: Complete student lifecycle management with grade tracking
- **Branch Management**: Manage multiple school branches with academic year tracking

### Classroom Management
- **Classroom Creation**: Set up classrooms with capacity limits
- **Student Enrollment**: Assign students to classrooms with validation
- **Grade Management**: Track and manage student grades per classroom

### Library System
- **Book Management**: Add, update, and remove books from the library
- **Book Loans**: Issue books to students with due dates
- **Return Processing**: Handle book returns with status tracking
- **Return Requests**: Students can request book returns before due dates

### Financial Management
- **Budget Allocation**: Allocate budgets to branches and classrooms
- **Transaction Tracking**: Record and monitor income and expenses
- **Category Management**: Organize transactions by customizable categories
- **Financial Reports**: Generate detailed financial summaries and analytics

### Reports & Analytics
- **Monthly Reports**: Automated monthly report generation
- **Financial Summaries**: Budget utilization and transaction summaries
- **Student Analytics**: Student enrollment and academic performance tracking
- **Library Statistics**: Book circulation and loan status reports
- **Custom Reports**: Generate reports for specific date ranges

### Document Management
- **Secure Storage**: Documents stored in Supabase Storage buckets
- **Document Upload**: Support for profile pictures, ID documents, and other files
- **Access Control**: Document access controlled via Row Level Security

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Routing**: React Router DOM v7
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Backend**: Supabase (PostgreSQL database + Authentication + Storage)
- **Build Tool**: Vite
- **Language**: TypeScript

## Project Structure

```
project/
├── src/
│   ├── components/          # Reusable components
│   │   ├── AddStaffModal.tsx
│   │   ├── DocumentUpload.tsx
│   │   ├── EditStudentModal.tsx
│   │   ├── Layout.tsx
│   │   ├── ProtectedRoute.tsx
│   │   └── Toast.tsx
│   ├── contexts/            # React contexts
│   │   └── AuthContext.tsx
│   ├── hooks/               # Custom hooks
│   │   └── useToast.ts
│   ├── lib/                 # Libraries and utilities
│   │   ├── database.types.ts
│   │   └── supabase.ts
│   ├── pages/               # Page components
│   │   ├── Approvals.tsx
│   │   ├── Branches.tsx
│   │   ├── Classrooms.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Library.tsx
│   │   ├── Login.tsx
│   │   ├── PendingApproval.tsx
│   │   ├── Profile.tsx
│   │   ├── Reports.tsx
│   │   ├── ResetPassword.tsx
│   │   ├── Signup.tsx
│   │   ├── Staff.tsx
│   │   └── Students.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   ├── functions/           # Edge Functions
│   │   ├── create-user/
│   │   ├── delete-user/
│   │   ├── generate-monthly-reports/
│   │   └── monthly-report-scheduler/
│   └── migrations/          # Database migrations
└── public/                  # Static assets
```

## Database Schema

### Core Tables
- **profiles**: User profiles with role and approval status
- **staff**: Staff member details and employment information
- **students**: Student records with academic information
- **branches**: School branch locations and academic years
- **classrooms**: Classroom information with capacity and enrollment
- **classroom_enrollments**: Student-classroom relationships
- **grades**: Student grade records per classroom

### Library Tables
- **books**: Book catalog with ISBN and availability status
- **book_loans**: Book checkout records with due dates and returns

### Financial Tables
- **budgets**: Budget allocations for branches and classrooms
- **transaction_categories**: Customizable transaction categories
- **transactions**: Income and expense records
- **generated_reports**: Stored monthly and custom reports

### Storage Buckets
- **documents**: Secure document storage with RLS policies

## Security Features

- **Row Level Security (RLS)**: All tables protected with PostgreSQL RLS policies
- **Authentication Required**: All routes protected except login/signup
- **Role-Based Permissions**: Admins and Super Admins have elevated privileges
- **Secure Document Access**: Document access controlled via storage policies
- **Data Validation**: Input validation on both client and server side
- **SQL Injection Protection**: Parameterized queries via Supabase client

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Supabase account and project

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd project
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:
```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

4. Run database migrations:
- Navigate to your Supabase project dashboard
- Go to SQL Editor
- Run each migration file in order from the `supabase/migrations/` directory

5. Deploy Edge Functions (optional):
```bash
# Deploy the functions using Supabase Dashboard or CLI
```

### Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Default Admin Account

After running migrations, a default Super Admin account is created:

- **Email**: admin@pxp.com
- **Password**: admin123

**Important**: Change this password immediately after first login.

## User Roles

### Super Admin
- All Admin permissions
- Can promote users to Admin role
- Highest level of access

### Admin
- Approve/reject user registrations
- Manage staff and students
- Create and manage branches
- Manage classrooms and enrollments
- Library management
- Budget and transaction management
- Generate and view reports

### Staff
- View dashboard
- Access classrooms
- Access library
- View their own profile
- Limited access to other features

## Key Features Explained

### Approval Workflow
1. New users sign up with email/password
2. Account is created with "pending" status
3. User sees "Pending Approval" message
4. Admin reviews and approves/rejects from Approvals page
5. Approved users gain full access based on their role

### Library System
1. Admins add books to the library catalog
2. Students can be issued books with due dates
3. Students can request returns before due date
4. Admins process returns and update book status
5. Overdue books are tracked and displayed

### Budget Management
1. Admins create budgets for branches or classrooms
2. Transactions are recorded against budgets
3. System tracks budget utilization
4. Reports show spending patterns and remaining budgets

### Report Generation
1. Monthly reports auto-generate via Edge Functions
2. Reports include student, staff, financial, and library data
3. Custom reports can be generated for specific date ranges
4. Reports stored in database for historical reference

## Edge Functions

### create-user
Creates authenticated users and their profile records (Admin only).

### delete-user
Deletes users and all associated data (Admin only).

### generate-monthly-reports
Generates comprehensive monthly reports with system-wide statistics.

### monthly-report-scheduler
Automated scheduler for generating monthly reports.

## Deployment

### Netlify / Vercel
Configuration files included:
- `netlify.toml`
- `vercel.json`

Push to Git and connect to your deployment platform.

### Manual Deployment
1. Build the project: `npm run build`
2. Upload the `dist/` directory to your hosting provider
3. Ensure environment variables are configured
4. Set up redirects for SPA routing

## Environment Variables

Required environment variables:

```
VITE_SUPABASE_URL=your-project-url.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is proprietary software. All rights reserved.

## Support

For issues and questions, please contact the development team or create an issue in the repository.

## Acknowledgments

- Built with Supabase for backend infrastructure
- UI components styled with Tailwind CSS
- Icons provided by Lucide React
