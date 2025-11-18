# My VoIP App

This project is a simple WebRTC phone application that allows users to make voice and video calls through their web browsers. It utilizes WebRTC for real-time communication and Socket.IO for signaling.

## Project Structure

```
my-voip-app
├── src
│   ├── server.js          # Entry point for the server-side application
│   └── public
│       ├── index.html     # UI markup
│       ├── styles.css     # UI styles
│       └── client.js      # Client-side WebRTC + signaling logic
├── package.json           # npm scripts and dependencies
└── README.md              # Project documentation
```

## Setup Instructions

1. **Clone the repository:**
   ```
   git clone <repository-url>
   cd my-voip-app
   ```

2. **Install dependencies:**
   ```
   npm install
   ```

3. **Run the server:**
   ```
   npm start
   ```

4. **Open your browser:**
   Navigate to `http://localhost:3000` to access the WebRTC phone application.

## Usage Guidelines

- Ensure that your browser supports WebRTC.
- Allow microphone and camera access when prompted.
- Use the interface to initiate or receive calls.

## Contributing

Feel free to submit issues or pull requests if you have suggestions or improvements for the project.