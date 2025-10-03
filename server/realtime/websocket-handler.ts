import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { IncomingMessage } from 'http';
import { parse } from 'url';
import { OpenAIRealtimeSession } from './openai-realtime';

interface VoiceSession {
  userId: number;
  sessionNumber: number;
  ws: WebSocket;
  openaiSession: OpenAIRealtimeSession | null;
}

const activeSessions = new Map<string, VoiceSession>();

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ 
    noServer: true,
    path: '/ws/voice'
  });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const { pathname } = parse(request.url || '');
    
    if (pathname === '/ws/voice') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws: WebSocket, request: IncomingMessage) => {
    console.log('[WebSocket] New voice connection');
    
    let sessionKey: string | null = null;
    let voiceSession: VoiceSession | null = null;

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'start':
            // Start a new voice session
            const { userId, sessionNumber } = message;
            sessionKey = `${userId}-${sessionNumber}`;
            
            console.log(`[WebSocket] Starting voice session for user ${userId}, session ${sessionNumber}`);
            
            // Create OpenAI Realtime session
            const openaiSession = new OpenAIRealtimeSession({
              onTranscriptionDelta: (text: string) => {
                ws.send(JSON.stringify({
                  type: 'transcription_delta',
                  text
                }));
              },
              onTranscriptionComplete: (text: string) => {
                ws.send(JSON.stringify({
                  type: 'transcription_complete',
                  text
                }));
              },
              onError: (error: string) => {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: error
                }));
              }
            });

            await openaiSession.connect();
            
            voiceSession = {
              userId,
              sessionNumber,
              ws,
              openaiSession
            };
            
            activeSessions.set(sessionKey, voiceSession);
            
            ws.send(JSON.stringify({
              type: 'session_started',
              sessionKey
            }));
            break;

          case 'audio':
            // Forward audio chunk to OpenAI
            if (voiceSession?.openaiSession) {
              await voiceSession.openaiSession.sendAudio(message.data);
            } else {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'No active voice session'
              }));
            }
            break;

          case 'stop':
            // Stop recording and finalize transcription
            if (voiceSession?.openaiSession) {
              await voiceSession.openaiSession.stopAudio();
            }
            break;

          case 'end':
            // End the session
            if (sessionKey && voiceSession?.openaiSession) {
              await voiceSession.openaiSession.disconnect();
              activeSessions.delete(sessionKey);
              console.log(`[WebSocket] Voice session ended for ${sessionKey}`);
            }
            break;
        }
      } catch (error) {
        console.error('[WebSocket] Error processing message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        }));
      }
    });

    ws.on('close', async () => {
      console.log('[WebSocket] Connection closed');
      if (sessionKey && voiceSession?.openaiSession) {
        await voiceSession.openaiSession.disconnect();
        activeSessions.delete(sessionKey);
      }
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] WebSocket error:', error);
    });
  });

  console.log('[WebSocket] Voice WebSocket server initialized');
  return wss;
}
