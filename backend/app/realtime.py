from fastapi import WebSocket
from typing import Set
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.connections: dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, tenant_id: int):
        await websocket.accept()
        self.connections.setdefault(tenant_id, set()).add(websocket)

    def disconnect(self, websocket: WebSocket, tenant_id: int):
        connections = self.connections.get(tenant_id)
        if connections:
            connections.discard(websocket)
            if not connections:
                self.connections.pop(tenant_id, None)

    async def broadcast(self, tenant_id: int, payload: dict):
        stale = []
        for connection in list(self.connections.get(tenant_id, set())):
            try:
                await connection.send_json(payload)
            except Exception:
                logger.exception("Removing stale tenant WebSocket connection")
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection, tenant_id)

manager = ConnectionManager()
