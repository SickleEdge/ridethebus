"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"

// Global connection tracking
let globalWs: WebSocket | null = null
let connectionAttemptInProgress = false
let lastConnectionTime = 0
const RECONNECT_THROTTLE_MS = 5000 // Prevent reconnections within 5 seconds

// Helper function to get the WebSocket URL based on the current environment
const getWebSocketUrl = () => {
  if (typeof window === 'undefined') return "";
  
  // In development or when hosted locally
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return "ws://localhost:3001";
  }
  
  // When hosted on GitHub Pages or other production environment
  // This should be updated with your actual production WebSocket server URL
  return "wss://your-websocket-server.com";
}

interface Room {
  id: string
  players: { name: string; score: number }[]
  isGameStarted: boolean
  playerCount?: number
  creator?: string
}

export default function RoomList() {
  const router = useRouter()
  const [rooms, setRooms] = useState<Room[]>([])
  const [error, setError] = useState<string>("")
  const [errorDetails, setErrorDetails] = useState<string>("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [reconnectTimeout, setReconnectTimeout] = useState<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)
  const [wsUrl, setWsUrl] = useState<string>("")

  // Set WebSocket URL after component mounts
  useEffect(() => {
    setWsUrl(getWebSocketUrl());
  }, []);

  const connect = useCallback(() => {
    if (!wsUrl) return;
    
    // Strict throttling and singleton connection enforcement
    const now = Date.now()
    if (
      connectionAttemptInProgress || 
      (globalWs && globalWs.readyState !== WebSocket.CLOSED) || 
      (now - lastConnectionTime < RECONNECT_THROTTLE_MS)
    ) {
      console.log("[ROOMLIST] Skipping connection - already connected or recent attempt")
      setIsConnecting(false)
      return
    }

    connectionAttemptInProgress = true
    lastConnectionTime = now
    
    setIsConnecting(true)
    setError("")
    setErrorDetails("")
    
    try {
      console.log("[ROOMLIST] Creating WebSocket connection (STRICTLY CONTROLLED)")
      const newWs = new WebSocket(wsUrl)
      globalWs = newWs
      
      newWs.onopen = () => {
        console.log("[ROOMLIST] Connected to WebSocket server")
        connectionAttemptInProgress = false
        
        if (!mountedRef.current) return
        
        setIsConnecting(false)
        setRetryCount(0)
        
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout)
          setReconnectTimeout(null)
        }
        
        // Request initial room list
        try {
          newWs.send(JSON.stringify({ type: "getRooms" }))
        } catch (err) {
          console.error("[ROOMLIST] Error requesting room list:", err)
        }
      }

      newWs.onmessage = (event) => {
        if (!mountedRef.current) return
        
        try {
          const data = JSON.parse(event.data)
          if (data.type === "roomsList") {
            setRooms(data.rooms || [])
          } else if (data.type === "error") {
            console.error(`[ROOMLIST] Server error: ${data.code} - ${data.message}`)
            setErrorDetails(`Server error: ${data.code} - ${data.message}`)
          }
        } catch (err) {
          console.error("[ROOMLIST] Error parsing WebSocket message:", err)
          setErrorDetails(`Error parsing message: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }

      newWs.onerror = (error) => {
        console.error("[ROOMLIST] WebSocket error:", error)
        connectionAttemptInProgress = false
        
        if (!mountedRef.current) return
        
        setErrorDetails(`Connection error: ${error.type || "Unknown error"}`)
        setError("Connection error. Please try again.")
        setIsConnecting(false)
      }

      newWs.onclose = (event) => {
        console.log(`[ROOMLIST] WebSocket closed with code ${event.code}, reason: ${event.reason || "No reason provided"}`)
        connectionAttemptInProgress = false
        globalWs = null
        
        if (!mountedRef.current) return
        
        setIsConnecting(false)
        
        // Only retry on abnormal closures, not intentional ones, and only if still mounted
        if (
          event.code !== 1000 && 
          event.code !== 1001 && 
          retryCount < 3 && 
          mountedRef.current
        ) {
          const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 8000)
          console.log(`[ROOMLIST] Will attempt to reconnect in ${backoffTime}ms (attempt ${retryCount + 1})`)
          
          const timeout = setTimeout(() => {
            if (mountedRef.current) {
              setRetryCount(prev => prev + 1)
              connect()
            }
          }, backoffTime)
          
          setReconnectTimeout(timeout)
        } else if (event.code !== 1000 && event.code !== 1001) {
          setError("Unable to connect to server. Please refresh the page.")
          setErrorDetails(`WebSocket closed with code ${event.code}, reason: ${event.reason || "No reason provided"}`)
        }
      }
    } catch (err: any) {
      console.error("[ROOMLIST] Error creating WebSocket:", err)
      connectionAttemptInProgress = false
      setError(`Failed to create connection: ${err.message}`)
      setErrorDetails(err.stack || "No stack trace available")
      setIsConnecting(false)
    }
  }, [wsUrl, retryCount, reconnectTimeout])

  useEffect(() => {
    mountedRef.current = true;
    
    // Check if we already have a global connection before making a new one
    if (globalWs && (globalWs.readyState === WebSocket.OPEN || globalWs.readyState === WebSocket.CONNECTING)) {
      console.log("[ROOMLIST] Using existing global WebSocket connection")
      setIsConnecting(globalWs.readyState === WebSocket.CONNECTING)
      
      // Attach our handlers to the existing connection
      const existingWs = globalWs;
      
      // Request room list if connection is already open
      if (existingWs.readyState === WebSocket.OPEN) {
        try {
          existingWs.send(JSON.stringify({ type: "getRooms" }))
        } catch (err) {
          console.error("[ROOMLIST] Error requesting room list from existing connection:", err)
        }
      }
      
      // Set up message handler on existing connection
      const messageHandler = (event: MessageEvent) => {
        if (!mountedRef.current) return
        
        try {
          const data = JSON.parse(event.data)
          if (data.type === "roomsList") {
            setRooms(data.rooms || [])
          }
        } catch (err) {
          console.error("[ROOMLIST] Error parsing message from existing connection:", err)
        }
      };
      
      existingWs.addEventListener('message', messageHandler);
      
      // Set up cleanup for the message handler
      return () => {
        mountedRef.current = false;
        existingWs.removeEventListener('message', messageHandler);
        
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }
      };
    } else {
      // No existing connection, create a new one
      connect();
      
      // Set up cleanup
      return () => {
        mountedRef.current = false
        
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout)
        }
        
        // Only close the global WebSocket if this component created it
        if (globalWs) {
          console.log("[ROOMLIST] Global WebSocket exists on unmount, but not closing it");
          // Don't close it - other components may be using it
        }
      }
    }
  // Only run this effect once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Set up ping interval at module level to prevent multiple intervals
  useEffect(() => {
    // Only set up the ping interval if we don't have one already
    const pingInterval = setInterval(() => {
      if (globalWs && globalWs.readyState === WebSocket.OPEN) {
        try {
          globalWs.send(JSON.stringify({ type: "ping" }))
        } catch (err) {
          console.error("[ROOMLIST] Error sending ping:", err)
        }
      }
    }, 30000)

    return () => {
      clearInterval(pingInterval)
    }
  }, [])

  const handleRefresh = () => {
    if (globalWs && globalWs.readyState === WebSocket.OPEN) {
      try {
        globalWs.send(JSON.stringify({ type: "getRooms" }))
      } catch (err) {
        console.error("[ROOMLIST] Error requesting room list refresh:", err)
      }
    } else {
      // If WebSocket is closed, reconnect
      connect()
    }
  }

  const handleJoinRoom = (roomId: string) => {
    router.push(`/game?room=${roomId}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white">Available Rooms</h2>
        <button 
          onClick={handleRefresh}
          className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 text-sm flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          Refresh
        </button>
      </div>
      
      {isConnecting && (
        <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg p-3 text-sm flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
          Connecting to server...
        </div>
      )}
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-3 text-sm space-y-2">
          <div>{error}</div>
          {errorDetails && (
            <div className="text-xs bg-black/20 p-2 rounded overflow-auto max-h-24 text-red-300">
              {errorDetails}
            </div>
          )}
          <button
            onClick={() => {
              setError("")
              setErrorDetails("")
              setRetryCount(0)
              connect()
            }}
            className="w-full mt-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-sm"
          >
            Try Again
          </button>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map((room) => (
          <div
            key={room.id}
            className="bg-white/5 backdrop-blur-sm rounded-lg p-4 hover:bg-white/10 transition-all duration-200 cursor-pointer"
            onClick={() => handleJoinRoom(room.id)}
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-white font-medium">Room {room.id}</h3>
              <span className={`text-xs px-2 py-1 rounded-full ${
                room.isGameStarted 
                  ? "bg-red-500/20 text-red-400" 
                  : "bg-green-500/20 text-green-400"
              }`}>
                {room.isGameStarted ? "In Game" : "Waiting"}
              </span>
            </div>
            <div className="text-white/60 text-sm">
              {room.players.length} player{room.players.length !== 1 ? "s" : ""}
              {room.creator && <span className="text-white/40 ml-1">· Created by {room.creator}</span>}
            </div>
          </div>
        ))}
      </div>

      {rooms.length === 0 && !error && !isConnecting && (
        <div className="text-center text-white/60 py-8">
          No rooms available. Create a new room to start playing!
        </div>
      )}
    </div>
  )
} 