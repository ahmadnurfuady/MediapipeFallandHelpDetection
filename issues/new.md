## Features

1. **Guest User Login Button** - Add prominent button in header when user is in guest mode to encourage them to login
2. **Rehab History Panel** - Display previous rehab sessions with timestamps from Firestore for logged-in users
3. **Username System** - All users (both email and Google login) must have unique username displayed in UI
4. **Email/Password Authentication** - Complete registration and login system with username, email, password
5. **Firestore Structure** - users/{userId}/profile/ with username, users/{userId}/rehabHistory/, usernames/ collection

## Implementation Requirements:
- Username: 3-20 characters, alphanumeric and underscore only, unique, case-insensitive
- Password strength indicator with color coding
- Real-time username availability check
- Indonesian error messages for all auth errors
- History panel with Indonesian timestamp formatting
- Pagination for history (10 entries per load)
- Delete history entry option
- Mobile responsive design
- Both Google and Email auth result in same UX with username display
