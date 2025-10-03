import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { IncomingMessage } from 'http';
import { parse } from 'url';
import { parse as parseCookie } from 'cookie';
import session from 'express-session';
import { storage } from '../storage';
import { OpenAIRealtimeSession } from './openai-realtime';

interface VoiceSession {
  userId: number;
  sessionNumber: number;
  ws: WebSocket;
  openaiSession: OpenAIRealtimeSession | null;
}

const activeSessions = new Map<string, VoiceSession>();

// Get session from request
async function getSessionFromRequest(request: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const sessionSettings: session.SessionOptions = {
      secret: process.env.SESSION_SECRET || "supersecretkey",
      resave: false,
      saveUninitialized: false,
      store: storage.sessionStore,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000
      }
    };

    const sessionMiddleware = session(sessionSettings);
    
    // Create mock response object
    const mockRes: any = {
      getHeader: () => {},
      setHeader: () => {},
      end: () => {}
    };

    sessionMiddleware(request as any, mockRes, () => {
      const sess = (request as any).session;
      if (sess && sess.passport && sess.passport.user) {
        resolve(sess.passport.user);
      } else {
        reject(new Error('Unauthorized'));
      }
    });
  });
}

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ 
    noServer: true,
    path: '/ws/voice'
  });

  server.on('upgrade', async (request: IncomingMessage, socket, head) => {
    const { pathname } = parse(request.url || '');
    
    if (pathname === '/ws/voice') {
      try {
        // Authenticate the WebSocket connection
        const userId = await getSessionFromRequest(request);
        
        if (!userId) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        // Store userId on request for later use
        (request as any).userId = userId;

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } catch (error) {
        console.error('[WebSocket] Authentication failed:', error);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws: WebSocket, request: IncomingMessage) => {
    const authenticatedUserId = (request as any).userId;
    console.log(`[WebSocket] New voice connection for user ${authenticatedUserId}`);
    
    let sessionKey: string | null = null;
    let voiceSession: VoiceSession | null = null;

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'start':
            // Validate that the requested userId matches the authenticated user
            const { userId, sessionNumber } = message;
            
            if (userId !== authenticatedUserId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Unauthorized: User ID mismatch'
              }));
              ws.close();
              return;
            }

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
      console.log(`[WebSocket] Connection closed for user ${authenticatedUserId}`);
      if (sessionKey && voiceSession?.openaiSession) {
        await voiceSession.openaiSession.disconnect();
        activeSessions.delete(sessionKey);
      }
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] WebSocket error:', error);
      if (sessionKey && voiceSession?.openaiSession) {
        voiceSession.openaiSession.disconnect();
        activeSessions.delete(sessionKey);
      }
    });
  });

  console.log('[WebSocket] Voice WebSocket server initialized');
  return wss;
}
