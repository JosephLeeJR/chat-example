const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// Track connected users and their information
const users = {};
let userCount = 0;

// Track rooms and their users
const rooms = {
  'General': {} // Default room
};

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Helper functions for room management
function getRoomUserCount(roomName) {
  return rooms[roomName] ? Object.keys(rooms[roomName]).length : 0;
}

function getAvailableRooms() {
  return Object.keys(rooms).map(room => {
    return {
      name: room,
      userCount: getRoomUserCount(room)
    };
  });
}

function getRoomUsernames(roomName) {
  if (!rooms[roomName]) return [];
  return Object.values(rooms[roomName]).map(userId => users[userId].username);
}

function addUserToRoom(socketId, roomName) {
  // Create room if it doesn't exist
  if (!rooms[roomName]) {
    rooms[roomName] = {};
  }
  
  // Add user to room
  rooms[roomName][socketId] = socketId;
}

function removeUserFromRoom(socketId, roomName) {
  if (rooms[roomName] && rooms[roomName][socketId]) {
    delete rooms[roomName][socketId];
    
    // Remove empty rooms (except General)
    if (roomName !== 'General' && Object.keys(rooms[roomName]).length === 0) {
      delete rooms[roomName];
    }
  }
}

io.on('connection', (socket) => {
  // Generate a default username for new user
  const defaultUsername = `user${String(++userCount).padStart(3, '0')}`;
  
  // Store user information
  users[socket.id] = {
    username: defaultUsername,
    room: 'General'
  };
  
  // Add user to default room
  addUserToRoom(socket.id, 'General');
  
  // Join the default room
  socket.join('General');
  
  // Notify the user of their default information
  socket.emit('user info', {
    username: defaultUsername,
    room: 'General'
  });
  
  // 1a and 1b: Apply notifications for joining a chatroom and new username
  // 2a: Notify the user about the room they joined
  socket.emit('room joined', {
    room: 'General',
    userCount: getRoomUserCount('General')
  });
  
  // 2b: Notify the user about the list of users in the room
  socket.emit('room users', {
    room: 'General',
    users: getRoomUsernames('General')
  });
  
  // 1c: Notify the user about available chatrooms
  socket.emit('available rooms', getAvailableRooms());
  
  // 2c: Notify others in the room that a new user has joined
  socket.to('General').emit('user joined', {
    username: defaultUsername,
    room: 'General',
    userCount: getRoomUserCount('General')
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
    const oldUsername = user.username;
    let usernameChanged = false;
    let roomChanged = false;
    
    // Handle username change if provided
    if (username && username !== user.username) {
      // Check if username is available
      const isUsernameTaken = Object.values(users).some(
        u => u.username === username && socket.id !== Object.keys(users).find(key => users[key] === u)
      );
      
      if (!isUsernameTaken) {
        user.username = username;
        usernameChanged = true;
        
        // 4a: Notify user about successful username change
        socket.emit('username changed', {
          username: username
        });
        
        // 4b: Notify others in the room about username change
        socket.to(user.room).emit('user renamed', {
          oldUsername: oldUsername,
          newUsername: username
        });
      } else {
        // 5a: Notify user about username conflict
        socket.emit('username error', `'${username}' is already in use.`);
        return;
      }
    }
    
    // Handle room change if provided
    if (room && room !== user.room) {
      // Leave the current room
      socket.leave(user.room);
      
      // 3a: Notify users in old room that this user has left
      removeUserFromRoom(socket.id, user.room);
      socket.to(user.room).emit('user left', {
        username: user.username,
        room: user.room,
        userCount: getRoomUserCount(user.room)
      });
      
      // Join the new room
      socket.join(room);
      user.room = room;
      roomChanged = true;
      
      // Add user to new room
      addUserToRoom(socket.id, room);
      
      // 2a: Notify user about the room they joined
      socket.emit('room joined', {
        room: room,
        userCount: getRoomUserCount(room)
      });
      
      // 2b: Notify user about the list of users in the room
      socket.emit('room users', {
        room: room,
        users: getRoomUsernames(room)
      });
      
      // 2c: Notify others in the new room that this user joined
      socket.to(room).emit('user joined', {
        username: user.username,
        room: room,
        userCount: getRoomUserCount(room)
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
      
      // Remove user from room
      removeUserFromRoom(socket.id, room);
      
      // 3a: Notify remaining users in the room that this user left
      socket.to(room).emit('user left', {
        username: username,
        room: room,
        userCount: getRoomUserCount(room)
      });
      
      // Clean up user data
      delete users[socket.id];
    }
  });
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});