package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/gorilla/websocket"
)

type Message map[string]interface{}

type Client struct {
	id   string
	conn *websocket.Conn
}

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	peers   = map[string]*Client{}
	peersMu sync.Mutex
)

func randID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func broadcastPeerCount() {
	peersMu.Lock()
	defer peersMu.Unlock()
	msg := Message{"type": "peerCount", "count": len(peers)}
	for _, c := range peers {
		c.conn.WriteJSON(msg)
	}
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade error:", err)
		return
	}
	id := randID()
	client := &Client{id: id, conn: conn}

	// Register client
	peersMu.Lock()
	peers[id] = client
	peersMu.Unlock()

	// Send own ID
	if err := conn.WriteJSON(Message{"type": "myId", "id": id}); err != nil {
		log.Println("send myId error:", err)
	}

	// Broadcast peer count
	broadcastPeerCount()
	log.Println("New user connected:", id)

	// Read loop
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg Message
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Println("invalid json:", err)
			continue
		}

		typ, _ := msg["type"].(string)
		to, _ := msg["to"].(string)
		if typ == "" {
			continue
		}

		switch typ {
		case "offer", "answer", "ice-candidate", "hangup":
			if to == "" {
				continue
			}
			peersMu.Lock()
			target := peers[to]
			peersMu.Unlock()
			if target != nil {
				msg["from"] = id
				if err := target.conn.WriteJSON(msg); err != nil {
					log.Println("forward error:", err)
				}
			}
		default:
			// ignore unknown types
		}
	}

	// Cleanup on disconnect
	peersMu.Lock()
	delete(peers, id)
	peersMu.Unlock()
	_ = conn.Close()
	broadcastPeerCount()
	log.Println("User disconnected:", id)
}

func main() {
	// Serve static files from src/public
	fs := http.FileServer(http.Dir("src/public"))
	http.Handle("/", fs)

	// WebSocket endpoint
	http.HandleFunc("/ws", wsHandler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	addr := ":" + port
	log.Printf("VoIP server is running at http://localhost:%s\n", port)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal(err)
	}
}