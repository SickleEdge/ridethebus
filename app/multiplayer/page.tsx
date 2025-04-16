"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import RoomList from "./components/RoomList"
import CreateRoom from "./components/CreateRoom"

export default function MultiplayerPage() {
  const router = useRouter()
  const [showCreateRoom, setShowCreateRoom] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 to-pink-900 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-bold text-white">Multiplayer Rooms</h1>
          <button
            onClick={() => setShowCreateRoom(true)}
            className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200"
          >
            Create Room
          </button>
        </div>

        <RoomList />
        {showCreateRoom && <CreateRoom onClose={() => setShowCreateRoom(false)} />}
      </div>
    </div>
  )
} 