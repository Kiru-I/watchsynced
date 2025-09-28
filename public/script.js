const socket = io()
const urlParams = new URLSearchParams(window.location.search)
const room = urlParams.get("room") || "room123"

let username = ""
let player, isRemote = false, pendingPlay = null, startClicked = false
let currentVideoId = null

document.getElementById("roomInfo").textContent = `Room: ${room}`

// Join Room
document.getElementById("joinBtn").addEventListener("click", () => {
  const inputName = document.getElementById("usernameInput").value.trim()
  username = inputName || "Guest"
  socket.emit("join", { room, username })
  document.getElementById("usernameOverlay").classList.add("hidden")
  document.getElementById("mainContent").classList.remove("hidden")
})

// Extract video ID
function extractVideoId(url) {
  const regex = /(?:v=|\/)([a-zA-Z0-9_-]{11})/
  const match = url.match(regex)
  return match ? match[1] : url
}

function onPlayerStateChange(event) {
  if (!player || !startClicked) return
  if (isRemote) return

  const time = player.getCurrentTime()
  if (event.data === YT.PlayerState.PLAYING)
    socket.emit("sync", { room, action: "play", time })
  else if (event.data === YT.PlayerState.PAUSED)
    socket.emit("sync", { room, action: "pause", time })
  else if (event.data === YT.PlayerState.ENDED)
    socket.emit("nextVideo", { room }) // auto next
}

// Room data
socket.on("roomData", ({ videoId, users, time, isPlaying }) => {
  currentVideoId = videoId
  renderUsers(users)
  if (player && startClicked) {
    player.loadVideoById(videoId, time || 0)
    if (isPlaying) player.playVideo()
    else player.pauseVideo()
  }
})

// Start watching
document.getElementById("startBtn").addEventListener("click", () => {
  if (startClicked) return
  startClicked = true

  document.getElementById("startOverlay").classList.add("hidden")
  document.getElementById("videoContainer").classList.remove("hidden")

  // 1. Create player with a temporary/placeholder video
  player = new YT.Player("video", {
    videoId: currentVideoId || "qFadbkCGBkQ", // initial placeholder
    playerVars: {
      autoplay: 1,
      playsinline: 1
    },
    events: {
      onReady: () => {
        player.playVideo()

        // // 2. After 2s, load the "real" video
        // setTimeout(() => {
        //   const targetId = currentVideoId || "_zgjWHqVUKM"
        //   player.loadVideoById(targetId) // replaces video
        //   player.playVideo() // ensure autoplay
        //   socket.emit("requestSync", { room })
        // }, 100)
      },
      onStateChange: onPlayerStateChange,
    },
  })
})


function onPlayerStateChange(event) {
  if (!player || !startClicked) return
  if (isRemote) return

  const time = player.getCurrentTime()

  if (event.data === YT.PlayerState.PLAYING) {
    socket.emit("sync", { room, action: "play", time })
  } 
  else if (event.data === YT.PlayerState.PAUSED) {
    socket.emit("sync", { room, action: "pause", time })
  } 
  else if (event.data === YT.PlayerState.ENDED) {
    socket.emit("nextVideo", { room }) // auto next
  } 
  else if (event.data === YT.PlayerState.BUFFERING) {
    // Handle stuck buffering by retrying
    setTimeout(() => {
      if (player.getPlayerState() === YT.PlayerState.BUFFERING) {
        player.playVideo()
      }
    }, 1000)
  }
}

// Sync events from server
socket.on("sync", ({ action, time }) => {
  if (!player || !startClicked) return
  isRemote = true

  const drift = Math.abs(player.getCurrentTime() - time)

  if (action === "play") {
    if (drift > 0.3) player.seekTo(time, true)
    if (player.getPlayerState() !== YT.PlayerState.PLAYING) {
      player.playVideo()
    }
  } 
  else if (action === "pause") {
    if (drift > 0.3) player.seekTo(time, true)
    if (player.getPlayerState() !== YT.PlayerState.PAUSED) {
      player.pauseVideo()
    }
  }

  // reset remote flag after short delay
  setTimeout(() => { isRemote = false }, 200)
})

// Sync state (initial state on join)
socket.on("syncState", ({ videoId, time, isPlaying }) => {
  if (!player) return
  currentVideoId = videoId

  isRemote = true
  player.loadVideoById(videoId, time || 0)

  if (isPlaying) {
    player.playVideo()
  } else {
    player.pauseVideo()
  }

  setTimeout(() => { isRemote = false }, 200)
})

// Queue update
socket.on("queueUpdate", (queue) => {
  const list = document.getElementById("queueList")
  list.innerHTML = ""
  queue.forEach((item, i) => {
    const li = document.createElement("li")
    li.className = "queue-item"
    li.innerHTML = `
      <img src="${item.thumbnail}" alt="thumb" class="thumb"/>
      <div class="queue-text">
        <strong>${i + 1}. ${item.title}</strong>
        <small>${item.videoId}</small>
      </div>
    `
    li.addEventListener("click", () => {
      socket.emit("playFromQueue", { room, index: i })
    })
    list.appendChild(li)
  })
})

// Video change
socket.on("videoChange", ({ videoId, time, isPlaying }) => {
  currentVideoId = videoId
  if (!player || !startClicked) return
  isRemote = true
  player.loadVideoById(videoId, time || 0)
  if (isPlaying) player.playVideo()
  else player.pauseVideo()
  isRemote = false
})

// Add to Queue
document.getElementById("addQueueBtn").addEventListener("click", () => {
  const vid = extractVideoId(document.getElementById("queueInput").value.trim())
  if (!vid) return
  socket.emit("addToQueue", { room, videoId: vid })
  document.getElementById("queueInput").value = ""
})
document.getElementById("queueInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") document.getElementById("addQueueBtn").click()
})

// Chat
const messagesDiv = document.getElementById("messages")
function sendMessage() {
  const msg = document.getElementById("chatInput").value.trim()
  if (!msg) return
  appendMessage(msg, username || "You")
  socket.emit("chat", { room, message: msg, username })
  document.getElementById("chatInput").value = ""
}
document.getElementById("sendChatBtn").addEventListener("click", sendMessage)
document.getElementById("chatInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage()
})

socket.on("chat", ({ message, username: sender }) =>
  appendMessage(message, sender)
)

function appendMessage(text, sender) {
  const div = document.createElement("div")
  div.className = "message"
  if (sender === username) div.classList.add("own")
  else div.classList.add("friend")
  div.textContent = `${sender}: ${text}`
  messagesDiv.appendChild(div)
  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

// User list
const userListEl = document.getElementById("userList")
socket.on("updateUsers", (users) => renderUsers(users))

function renderUsers(users) {
  userListEl.innerHTML = ""
  users.forEach((u) => {
    const li = document.createElement("li")
    li.textContent = u
    if (u === username) li.classList.add("self")
    userListEl.appendChild(li)
  })
}