const socket = io()
const urlParams = new URLSearchParams(window.location.search)
const room = urlParams.get("room") || "room123"

let username = ""
let player, isRemote = false, pendingPlay = null, startClicked = false
let currentVideoId = null

document.getElementById("roomInfo").textContent = `Room: ${room}`

document.getElementById("joinBtn").addEventListener("click", () => {
  const inputName = document.getElementById("usernameInput").value.trim()
  username = inputName || "Guest"
  socket.emit("join", { room, username })
  document.getElementById("usernameOverlay").classList.add("hidden")
  document.getElementById("mainContent").classList.remove("hidden")
})

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

socket.on("roomData", ({ videoId, users, time, isPlaying }) => {
  currentVideoId = videoId
  renderUsers(users)
  if (player && startClicked) {
    player.loadVideoById(videoId, time || 0)
    if (isPlaying) player.playVideo()
    else player.pauseVideo()
  }
})

document.getElementById("startBtn").addEventListener("click", () => {
  if (startClicked) return
  startClicked = true

  document.getElementById("startOverlay").classList.add("hidden")
  document.getElementById("videoContainer").classList.remove("hidden")

  player = new YT.Player("video", {
    videoId: currentVideoId || "qFadbkCGBkQ",
    playerVars: {
      autoplay: 1,
      playsinline: 1
    },
    events: {
      onReady: () => {
        player.playVideo()
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
    socket.emit("nextVideo", { room })
  } 
  else if (event.data === YT.PlayerState.BUFFERING) {
    setTimeout(() => {
      if (player.getPlayerState() === YT.PlayerState.BUFFERING) {
        player.playVideo()
      }
    }, 1000)
  }
}

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

  setTimeout(() => { isRemote = false }, 200)
})

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

socket.on("videoChange", ({ videoId, time, isPlaying }) => {
  currentVideoId = videoId
  if (!player || !startClicked) return
  isRemote = true
  player.loadVideoById(videoId, time || 0)
  if (isPlaying) player.playVideo()
  else player.pauseVideo()
  isRemote = false
})

document.getElementById("addQueueBtn").addEventListener("click", () => {
  const vid = extractVideoId(document.getElementById("queueInput").value.trim())
  if (!vid) return
  socket.emit("addToQueue", { room, videoId: vid })
  document.getElementById("queueInput").value = ""
})
document.getElementById("queueInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") document.getElementById("addQueueBtn").click()
})

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