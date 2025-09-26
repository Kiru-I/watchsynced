import express from "express"
import { createServer } from "http"
import { Server } from "socket.io"

const app = express()
const server = createServer(app)
const io = new Server(server, { cors: { origin: "*" } })

app.use(express.static("public"))

let userCount = 0
const rooms = {} // roomName -> array of usernames

io.on("connection", socket => {
  console.log("User connected")

  socket.on("join", ({ room, username }) => {
    userCount++
    socket.username = username || `user${userCount}`
    socket.room = room
    socket.join(room)

    if (!rooms[room]) rooms[room] = []
    rooms[room].push(socket.username)

    // Update user list for everyone in room
    io.to(room).emit("updateUsers", rooms[room])

    console.log(`${socket.username} joined room ${room}`)
  })

  socket.on("sync", data => socket.to(data.room).emit("sync", data))
  socket.on("videoChange", data => socket.to(data.room).emit("videoChange", data))
  socket.on("chat", ({ room, message, username }) => socket.to(room).emit("chat", { message, username }))

  socket.on("disconnect", () => {
    if (socket.room && rooms[socket.room]) {
      rooms[socket.room] = rooms[socket.room].filter(u => u !== socket.username)
      io.to(socket.room).emit("updateUsers", rooms[socket.room])
    }
    console.log(`${socket.username || 'A user'} disconnected`)
  })
})

server.listen(3000, () => console.log("Server running on http://localhost:3000"))
