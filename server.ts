import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { Deck, Card } from './deck'

// Define WebSocket close codes for specific errors
const ErrorCodes = {
  MISSING_PARAMS: 4000,
  DUPLICATE_CONNECTION: 4001,
  INVALID_ROOM: 4002,
  INTERNAL_ERROR: 4003,
}

// Extend WebSocket type with declaration merging
declare module 'ws' {
  interface WebSocket {
    roomListConnection?: boolean;
  }
}

const server = createServer()
const wss = new WebSocketServer({ 
  server, 
  clientTracking: true,
  // Add proper error handling for the WebSocket server
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    concurrencyLimit: 10,
  }
})

interface Player {
  name: string
  score: number
  ws: WebSocket
  roomId: string
  connectionTime: number
}

interface Room {
  id: string
  players: Player[]
  deck: Deck
  currentCard: Card | null
  stage: 'red_black' | 'higher_lower' | 'inside_outside' | 'suit' | null
  isGameStarted: boolean
  createdAt: number
  lastActivity: number
  creator: string
}

// Global maps to track state
const rooms = new Map<string, Room>()
const players = new Map<WebSocket, Player>()
const connections = new Map<string, WebSocket>() // roomId:playerName -> ws

// Create a separate set to track room list connections
const roomListConnections = new Set<WebSocket>()

// Debug helper
function logState() {
  console.log('---------- SERVER STATE ----------')
  console.log(`Active Rooms: ${rooms.size}`)
  console.log(`Active Players: ${players.size}`)
  console.log(`Active Connections: ${connections.size}`)
  
  rooms.forEach((room, roomId) => {
    console.log(`Room ${roomId}: ${room.players.length} players, created by ${room.creator}, game started: ${room.isGameStarted}`)
  })
  console.log('----------------------------------')
}

function broadcastToRoom(room: Room, message: any) {
  // Update room activity time
  room.lastActivity = Date.now()
  
  let receivedBy = 0
  const totalPlayers = room.players.length
  
  room.players.forEach(player => {
    if (player.ws.readyState === WebSocket.OPEN) {
      try {
        player.ws.send(JSON.stringify(message))
        receivedBy++
      } catch (err) {
        console.error(`[ERROR] Failed to send message to ${player.name} in room ${room.id}:`, err)
      }
    } else {
      console.warn(`[WARN] Cannot send to ${player.name} in room ${room.id}, WebSocket not open`)
    }
  })
  
  // Log broadcast statistics for debugging
  if (receivedBy < totalPlayers) {
    console.warn(`[WARN] Message type '${message.type}' only received by ${receivedBy}/${totalPlayers} players in room ${room.id}`)
  }
}

function handlePlayerDisconnect(ws: WebSocket, code?: number, reason?: string) {
  const player = players.get(ws)
  if (!player) {
    console.log(`[DISCONNECT] WebSocket disconnected but no player found`)
    return
  }

  console.log(`[DISCONNECT] Player ${player.name} disconnected from room ${player.roomId} with code ${code || 'unknown'}, reason: ${reason || 'No reason provided'}`)
  
  const room = rooms.get(player.roomId)
  if (!room) {
    console.log(`[ERROR] Room ${player.roomId} not found when disconnecting player ${player.name}`)
    players.delete(ws)
    connections.delete(`${player.roomId}:${player.name}`)
    return
  }
  
  // Remove player from room
  room.players = room.players.filter(p => p.ws !== ws)
  
  // Remove connection
  connections.delete(`${player.roomId}:${player.name}`)
  players.delete(ws)
  
  if (room.players.length === 0) {
    console.log(`[INFO] Room ${player.roomId} is now empty, removing it`)
    rooms.delete(room.id)
  } else {
    console.log(`[INFO] Room ${player.roomId} has ${room.players.length} players left`)
    broadcastToRoom(room, {
      type: 'playerLeft',
      playerName: player.name,
      players: room.players.map(p => ({ name: p.name, score: p.score }))
    })
  }
  
  // Log state after disconnect
  logState()
}

// Clean up stale rooms and connections - run every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000
const ROOM_TIMEOUT = 30 * 60 * 1000 // 30 minutes of inactivity

setInterval(() => {
  const now = Date.now()
  console.log(`[CLEANUP] Running cleanup check at ${new Date().toISOString()}`)
  
  let removedRooms = 0
  rooms.forEach((room, roomId) => {
    // Check for inactivity
    if (now - room.lastActivity > ROOM_TIMEOUT) {
      console.log(`[CLEANUP] Removing stale room ${roomId} (inactive for ${Math.round((now - room.lastActivity)/60000)} minutes)`)
      
      // Notify players before removing
      broadcastToRoom(room, {
        type: 'roomClosed',
        reason: 'Room closed due to inactivity'
      })
      
      // Close all websockets
      room.players.forEach(player => {
        try {
          player.ws.close(ErrorCodes.INVALID_ROOM, 'Room closed due to inactivity')
        } catch (err) {
          console.error(`[ERROR] Error closing player connection:`, err)
        }
      })
      
      // Clean up maps
      room.players.forEach(player => {
        players.delete(player.ws)
        connections.delete(`${player.roomId}:${player.name}`)
      })
      
      rooms.delete(roomId)
      removedRooms++
    }
  })
  
  if (removedRooms > 0) {
    console.log(`[CLEANUP] Removed ${removedRooms} stale rooms`)
    logState()
  }
}, CLEANUP_INTERVAL)

wss.on('connection', (ws, req) => {
  try {
    console.log(`[CONNECT] New WebSocket connection from ${req.socket.remoteAddress}`)
    
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const roomId = url.searchParams.get('room')
    const playerName = url.searchParams.get('name')

    console.log(`[CONNECT] Params - Room: ${roomId}, Player: ${playerName}`)

    // Room list connection (no room ID or player name)
    if (!roomId && !playerName) {
      console.log('[CONNECT] Room list connection established')
      // Add to room list connections instead of setting property
      roomListConnections.add(ws)
      
      const sendRoomsList = () => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            const roomsList = Array.from(rooms.entries()).map(([id, room]) => ({
              id,
              players: room.players.map(p => ({ name: p.name, score: p.score })),
              isGameStarted: room.isGameStarted,
              playerCount: room.players.length,
              creator: room.creator
            }))
            
            ws.send(JSON.stringify({
              type: 'roomsList',
              rooms: roomsList
            }))
          } catch (err) {
            console.error('[ERROR] Error sending room list:', err)
          }
        }
      }

      // Send initial room list
      sendRoomsList()

      // Set up interval to send room list updates
      const interval = setInterval(sendRoomsList, 1000)

      ws.on('close', (code, reason) => {
        console.log(`[DISCONNECT] Room list connection closed with code ${code}, reason: ${reason || 'No reason provided'}`)
        clearInterval(interval)
        roomListConnections.delete(ws)
      })

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString())
          if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }))
          } else if (data.type === "getRooms") {
            sendRoomsList()
          }
        } catch (err) {
          console.error('[ERROR] Failed to parse message from room list connection:', err)
        }
      })

      return
    }

    // Check if room ID and player name are provided
    if (!roomId || !playerName) {
      console.log('[ERROR] Invalid connection - missing room ID or player name')
      ws.close(ErrorCodes.MISSING_PARAMS, 'Missing room ID or player name')
      return
    }

    // Check for duplicate connections (same player joining the same room)
    const connectionKey = `${roomId}:${playerName}`
    if (connections.has(connectionKey)) {
      const existingWs = connections.get(connectionKey)
      
      // If the existing connection is still open, reject the new one
      if (existingWs && existingWs.readyState === WebSocket.OPEN) {
        console.log(`[ERROR] Duplicate connection attempt for ${playerName} in room ${roomId}`)
        ws.close(ErrorCodes.DUPLICATE_CONNECTION, 'You are already connected to this room')
        return
      }
      
      // If existing connection is closing/closed, clean it up first
      console.log(`[INFO] Replacing stale connection for ${playerName} in room ${roomId}`)
      if (existingWs) {
        try {
          // Clean up old connection
          players.delete(existingWs)
          connections.delete(connectionKey)
          if (existingWs.readyState !== WebSocket.CLOSED) {
            existingWs.close(1000, 'Replaced by new connection')
          }
        } catch (err) {
          console.error('[ERROR] Error cleaning up stale connection:', err)
        }
      }
    }
    
    // Store new connection
    connections.set(connectionKey, ws)
    
    // Get or create room
    let room = rooms.get(roomId)
    let isNewRoom = false
    
    if (!room) {
      console.log(`[INFO] Creating new room: ${roomId} by ${playerName}`)
      room = {
        id: roomId,
        players: [],
        deck: new Deck(),
        currentCard: null,
        stage: null,
        isGameStarted: false,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        creator: playerName
      }
      rooms.set(roomId, room)
      isNewRoom = true
    } else {
      console.log(`[INFO] Player ${playerName} joining existing room ${roomId} (${room.players.length} players)`)
      room.lastActivity = Date.now()
    }

    // Add player to room
    const player: Player = { 
      name: playerName, 
      score: 0, 
      ws, 
      roomId,
      connectionTime: Date.now()
    }
    
    // Remove any existing player with the same name (shouldn't happen after cleanup)
    room.players = room.players.filter(p => p.name !== playerName)
    
    // Add the new player
    room.players.push(player)
    players.set(ws, player)

    console.log(`[INFO] Player ${playerName} ${isNewRoom ? 'created' : 'joined'} room ${roomId}`)
    console.log(`[INFO] Room ${roomId} now has ${room.players.length} players`)

    // Notify all players in the room
    broadcastToRoom(room, {
      type: 'playerJoined',
      playerName,
      players: room.players.map(p => ({ name: p.name, score: p.score }))
    })

    // Handle client messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString())
        console.log(`[MESSAGE] From ${playerName} in ${roomId}: ${data.type}`)
        
        // Update room activity timestamp
        if (room) {
          room.lastActivity = Date.now()
        }
        
        switch (data.type) {
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }))
            break;
            
          case 'startGame':
            if (!room) {
              console.error(`[ERROR] Room ${roomId} not found when trying to start game`)
              ws.send(JSON.stringify({ 
                type: 'error', 
                code: 'ROOM_NOT_FOUND',
                message: 'Room no longer exists' 
              }))
              return
            }
            
            if (!room.isGameStarted) {
              console.log(`[GAME] Starting game in room ${roomId} with ${room.players.length} players`)
              room.isGameStarted = true
              room.deck.reset()
              room.stage = 'red_black'
              room.currentCard = room.deck.draw()
              
              broadcastToRoom(room, {
                type: 'gameStarted',
                stage: room.stage,
                currentCard: room.currentCard,
                players: room.players.map(p => ({ name: p.name, score: p.score }))
              })
            }
            break

          case 'guess':
            if (!room) {
              console.error(`[ERROR] Room ${roomId} not found when processing guess`)
              ws.send(JSON.stringify({ 
                type: 'error', 
                code: 'ROOM_NOT_FOUND',
                message: 'Room no longer exists' 
              }))
              return
            }
            
            if (!room.isGameStarted || !room.currentCard) {
              console.warn(`[WARN] Cannot process guess - game not started or no current card`)
              ws.send(JSON.stringify({ 
                type: 'error', 
                code: 'GAME_NOT_ACTIVE',
                message: 'Game is not active' 
              }))
              return
            }

            const nextCard = room.deck.draw()
            if (!nextCard) {
              handleGameOver(room)
              return
            }

            const isCorrect = checkGuess(data.guess, room.currentCard, nextCard)
            if (isCorrect) {
              player.score++
            }

            room.currentCard = nextCard
            room.stage = getNextStage(room.stage)

            console.log(`[GAME] Player ${playerName} guessed ${data.guess}, result: ${isCorrect ? 'correct' : 'incorrect'}`)
            
            broadcastToRoom(room, {
              type: 'guessResult',
              playerName: player.name,
              score: player.score,
              isCorrect,
              nextStage: room.stage,
              currentCard: room.currentCard
            })

            if (room.stage === null) {
              handleGameOver(room)
            }
            break
            
          case 'getState':
            // Allow clients to request current game state
            if (!room) {
              ws.send(JSON.stringify({ 
                type: 'error', 
                code: 'ROOM_NOT_FOUND',
                message: 'Room no longer exists' 
              }))
              return
            }
            
            ws.send(JSON.stringify({
              type: room.isGameStarted ? 'gameStarted' : 'waitingToStart',
              stage: room.stage,
              currentCard: room.currentCard,
              players: room.players.map(p => ({ name: p.name, score: p.score })),
              isGameStarted: room.isGameStarted
            }))
            break
        }
      } catch (err) {
        console.error(`[ERROR] Failed to handle message from ${playerName}:`, err)
        ws.send(JSON.stringify({ 
          type: 'error', 
          code: 'MESSAGE_PARSE_ERROR',
          message: 'Could not process your request' 
        }))
      }
    })

    // Handle connection errors
    ws.on('error', (error) => {
      console.error(`[ERROR] WebSocket error for ${playerName}:`, error)
      handlePlayerDisconnect(ws, ErrorCodes.INTERNAL_ERROR, 'Internal server error')
    })

    // Handle disconnection
    ws.on('close', (code, reason) => {
      handlePlayerDisconnect(ws, code, reason?.toString())
    })
    
    // Send initial game state if game is already in progress
    if (room.isGameStarted) {
      try {
        ws.send(JSON.stringify({
          type: 'gameStarted',
          stage: room.stage,
          currentCard: room.currentCard,
          players: room.players.map(p => ({ name: p.name, score: p.score }))
        }))
      } catch (err) {
        console.error(`[ERROR] Failed to send initial game state to ${playerName}:`, err)
      }
    }
    
    // Log state after connection
    logState()
    
  } catch (err) {
    // Global error handler for connection setup
    console.error('[CRITICAL] Unhandled error in connection handler:', err)
    try {
      ws.close(ErrorCodes.INTERNAL_ERROR, 'Internal server error')
    } catch (closeErr) {
      console.error('[CRITICAL] Error closing WebSocket after error:', closeErr)
    }
  }
})

function checkGuess(guess: string, currentCard: Card, nextCard: Card): boolean {
  switch (guess) {
    case 'red':
      return nextCard.suit === 'hearts' || nextCard.suit === 'diamonds'
    case 'black':
      return nextCard.suit === 'clubs' || nextCard.suit === 'spades'
    case 'higher':
      return nextCard.value > currentCard.value
    case 'lower':
      return nextCard.value < currentCard.value
    case 'inside':
      return Math.abs(nextCard.value - currentCard.value) <= 3
    case 'outside':
      return Math.abs(nextCard.value - currentCard.value) > 3
    default:
      return nextCard.suit === guess
  }
}

function getNextStage(currentStage: 'red_black' | 'higher_lower' | 'inside_outside' | 'suit' | null): 'red_black' | 'higher_lower' | 'inside_outside' | 'suit' | null {
  switch (currentStage) {
    case 'red_black':
      return 'higher_lower'
    case 'higher_lower':
      return 'inside_outside'
    case 'inside_outside':
      return 'suit'
    case 'suit':
      return null
    default:
      return null
  }
}

function handleGameOver(room: Room) {
  const maxScore = Math.max(...room.players.map(p => p.score))
  const winners = room.players
    .filter(p => p.score === maxScore)
    .map(p => p.name)

  console.log(`[GAME] Game over in room ${room.id}. Winners: ${winners.join(', ')}`)
  
  broadcastToRoom(room, {
    type: 'gameOver',
    winners,
    scores: room.players.map(p => ({ name: p.name, score: p.score }))
  })

  room.isGameStarted = false
  room.stage = null
  room.currentCard = null
}

// Handle server shutdown gracefully
process.on('SIGINT', () => {
  console.log('[SHUTDOWN] Server shutting down, closing all connections...')
  
  wss.clients.forEach(client => {
    try {
      client.close(1001, 'Server shutting down')
    } catch (err) {
      console.error('[SHUTDOWN] Error closing client connection:', err)
    }
  })
  
  // Give time for close messages to be sent before exiting
  setTimeout(() => {
    console.log('[SHUTDOWN] Exiting process')
    process.exit(0)
  }, 1000)
})

// Start the server
server.listen(3001, () => {
  console.log('[STARTUP] WebSocket server running on port 3001')
  console.log('[STARTUP] Server started at', new Date().toISOString())
}) 