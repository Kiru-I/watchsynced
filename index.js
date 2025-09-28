const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public")); // serve index.html

// Track rooms: { videoId, time, isPlaying, lastUpdate, users: [], queue: [] }
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
        queue: [],
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
    io.to(room).emit("queueUpdate", rooms[room].queue);
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
    rooms[room].isPlaying = true;
    rooms[room].lastUpdate = Date.now();

    io.to(room).emit("videoChange", {
      videoId,
      time: 0,
      isPlaying: true,
    });
  });

  // Add to queue with metadata
  socket.on("addToQueue", async ({ room, videoId }) => {
    if (!rooms[room]) return;
    try {
      const fetch = (await import("node-fetch")).default;
      const apiKey = process.env.YT_API_KEY; // <-- put your API key in .env
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
      );
      const data = await res.json();
      const snippet = data.items?.[0]?.snippet;

      const videoInfo = {
        videoId,
        title: snippet?.title || "Unknown title",
        thumbnail: snippet?.thumbnails?.default?.url || "",
      };

      rooms[room].queue.push(videoInfo);
      io.to(room).emit("queueUpdate", rooms[room].queue);
    } catch (err) {
      console.error("YT API error:", err);
    }
  });

  // Play from queue (clicking thumbnail/title)
  socket.on("playFromQueue", ({ room, index }) => {
    if (!rooms[room]) return;
    const video = rooms[room].queue.splice(index, 1)[0];
    if (video) {
      rooms[room].videoId = video.videoId;
      rooms[room].time = 0;
      rooms[room].isPlaying = true;
      rooms[room].lastUpdate = Date.now();

      io.to(room).emit("videoChange", {
        videoId: video.videoId,
        time: 0,
        isPlaying: true,
      });

      io.to(room).emit("queueUpdate", rooms[room].queue);
    }
  });

  // Next video when current ends
  socket.on("nextVideo", ({ room }) => {
    if (!rooms[room]) return;
    const next = rooms[room].queue.shift();
    if (next) {
      rooms[room].videoId = next.videoId;
      rooms[room].time = 0;
      rooms[room].isPlaying = true;
      rooms[room].lastUpdate = Date.now();

      io.to(room).emit("videoChange", {
        videoId: next.videoId,
        time: 0,
        isPlaying: true,
      });

      io.to(room).emit("queueUpdate", rooms[room].queue);
    }
  });

  // Chat
  socket.on("chat", ({ room, message, username }) => {
    socket.to(room).emit("chat", { message, username });
  });

  // Disconnect
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
