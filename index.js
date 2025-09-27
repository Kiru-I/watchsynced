const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public")); // serve index.html

// Track rooms: { videoId, time, isPlaying, lastUpdate, users: [] }
const rooms = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join", ({ room, username }) => {
    socket.join(room);

    if (!rooms[room]) {
      rooms[room] = {
        videoId: "_zgjWHqVUKM",
        time: 0,
        isPlaying: false,
        lastUpdate: Date.now(),
        users: [],
      };
    }

    rooms[room].users.push(username || `Guest-${socket.id.slice(0, 5)}`);
    socket.username = username;
    socket.room = room;

    // Send current state
    socket.emit("roomData", {
      videoId: rooms[room].videoId,
      users: rooms[room].users,
      time: getCurrentTime(rooms[room]),
      isPlaying: rooms[room].isPlaying,
    });

    io.to(room).emit("updateUsers", rooms[room].users);
  });

  socket.on("requestSync", ({ room }) => {
    if (!rooms[room]) return;
    socket.emit("syncState", {
      videoId: rooms[room].videoId,
      time: getCurrentTime(rooms[room]),
      isPlaying: rooms[room].isPlaying,
    });
  });

  socket.on("sync", ({ room, action, time }) => {
    if (!rooms[room]) return;

    if (action === "play") {
      rooms[room].isPlaying = true;
      rooms[room].time = time;
      rooms[room].lastUpdate = Date.now();
    } else if (action === "pause") {
      rooms[room].isPlaying = false;
      rooms[room].time = time;
      rooms[room].lastUpdate = Date.now();
    }

    socket.to(room).emit("sync", { action, time });
  });

  socket.on("videoChange", ({ room, videoId }) => {
    if (!rooms[room]) return;
    rooms[room].videoId = videoId;
    rooms[room].time = 0;
    rooms[room].isPlaying = false;
    rooms[room].lastUpdate = Date.now();

    io.to(room).emit("videoChange", {
      videoId,
      time: 0,
      isPlaying: false,
    });
  });

  socket.on("chat", ({ room, message, username }) => {
    socket.to(room).emit("chat", { message, username });
  });

  socket.on("disconnect", () => {
    const { room, username } = socket;
    if (room && rooms[room]) {
      rooms[room].users = rooms[room].users.filter((u) => u !== username);
      io.to(room).emit("updateUsers", rooms[room].users);
    }
    console.log("User disconnected:", socket.id);
  });
});

function getCurrentTime(roomData) {
  if (!roomData) return 0;
  if (roomData.isPlaying) {
    const elapsed = (Date.now() - roomData.lastUpdate) / 1000;
    return roomData.time + elapsed;
  }
  return roomData.time;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
