const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// Track connected users and their information
const users = {};
let userCount = 0;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  // Generate a default username for new user
  const defaultUsername = `user${String(++userCount).padStart(3, '0')}`;
  
  // Store user information
  users[socket.id] = {
    username: defaultUsername,
    room: 'General'
  };
  
  // Join the default room
  socket.join('General');
  
  // Notify the user of their default information
  socket.emit('user info', {
    username: defaultUsername,
    room: 'General'
  });
  
  // Send a welcome message to the room
  io.to('General').emit('chat message', {
    room: 'General',
    username: 'system',
    text: `${defaultUsername} has joined the room`,
    system: true
  });
  
  // Listen for chat messages
  socket.on('chat message', (msg) => {
    const user = users[socket.id];
    // Broadcast to the user's current room
    io.to(user.room).emit('chat message', {
      room: user.room,
      username: user.username,
      text: msg,
      senderId: socket.id
    });
  });
  
  // Handle room change and/or username change
  socket.on('update user', ({ username, room }) => {
    const user = users[socket.id];
    const oldRoom = user.room;
    let usernameChanged = false;
    let roomChanged = false;
    
    // Handle username change if provided
    if (username && username !== user.username) {
      // Check if username is available
      const isUsernameTaken = Object.values(users).some(
        u => u.username === username && socket.id !== Object.keys(users).find(key => users[key] === u)
      );
      
      if (!isUsernameTaken) {
        const oldUsername = user.username;
        user.username = username;
        usernameChanged = true;
        
        // Notify user that the username change was successful
        socket.emit('username updated', username);
      } else {
        // Notify user that the username is taken
        socket.emit('username error', 'Username is already taken');
        return;
      }
    }
    
    // Handle room change if provided
    if (room && room !== user.room) {
      // Leave the current room
      socket.leave(user.room);
      
      // Notify the old room that the user has left
      io.to(user.room).emit('chat message', {
        room: user.room,
        username: 'system',
        text: `${user.username} has left the room`,
        system: true
      });
      
      // Join the new room
      socket.join(room);
      user.room = room;
      roomChanged = true;
      
      // Notify the new room that the user has joined
      io.to(room).emit('chat message', {
        room: room,
        username: 'system',
        text: `${user.username} has joined the room`,
        system: true
      });
    }
    
    // Notify user about their current info
    if (usernameChanged || roomChanged) {
      socket.emit('user info', {
        username: user.username,
        room: user.room
      });
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    if (users[socket.id]) {
      const { username, room } = users[socket.id];
      
      // Notify the room that the user has left
      io.to(room).emit('chat message', {
        room: room,
        username: 'system',
        text: `${username} has disconnected`,
        system: true
      });
      
      // Clean up user data
      delete users[socket.id];
    }
  });
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});