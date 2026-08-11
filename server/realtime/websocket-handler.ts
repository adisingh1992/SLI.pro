import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { IncomingMessage } from 'http';
import { parse } from 'url';
import session from 'express-session';
import { storage } from '../storage';
import { VoiceTranscriptionSession } from './voice-transcription';

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

  /*
   * ── HANDLE OUR PATH; LEAVE EVERY OTHER UPGRADE ALONE ──────────────────────
   * `upgrade` is an event, not a router. Node delivers it to *every*
   * registered listener, and this process has two: this one, and Vite's HMR
   * socket in development. A listener that does not recognise a path has no
   * way to know whether another listener owns it, so the only safe response is
   * to return.
   *
   * This used to end with `else { socket.destroy(); }`, which assumed this was
   * the only WebSocket on the server. It never was. The reason nobody noticed
   * is that Vite's HMR client was separately misconfigured and built an
   * invalid URL (`ws://localhost:undefined`), so `new WebSocket()` threw in the
   * browser before any connection was attempted — a broken client masking a
   * broken server.
   *
   * Fixing the client made the collision immediate and spectacular: the HMR
   * handshake arrived here, was destroyed, and Vite's client took the closed
   * socket as "server connection lost", polled for a restart, and reloaded the
   * page — which reconnected, was destroyed again, and reloaded. An infinite
   * reload loop, from a one-line else branch.
   *
   * Unowned upgrades are now left to whoever else is listening. If nobody
   * claims one, the socket idles out; that is a far cheaper failure than
   * severing a connection that belongs to someone else.
   */
  server.on('upgrade', async (request: IncomingMessage, socket, head) => {
    const { pathname } = parse(request.url || '');

    if (pathname === '/ws/voice') {
      try {
        const userId = await getSessionFromRequest(request);
        
        if (!userId) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        (request as any).userId = userId;

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } catch (error) {
        console.error('[WebSocket] Authentication failed:', error);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    }
    // No `else`. Not ours — see above.
  });

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    const userId = (request as any).userId;
    console.log(`[WebSocket] Voice connection opened for user ${userId}`);
    
    let openaiSession: VoiceTranscriptionSession | null = null;

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'start') {
          console.log(`[WebSocket] Starting voice session for user ${userId}`);
          
          // Create OpenAI session
          openaiSession = new VoiceTranscriptionSession({
            onTranscriptionComplete: (text: string) => {
              ws.send(JSON.stringify({
                type: 'transcription_complete',
                text
              }));
            },
            onError: (error: string) => {
              ws.send(JSON.stringify({
                type: 'error',
                error
              }));
            }
          });
          
          ws.send(JSON.stringify({ type: 'ready' }));
          
        } else if (message.type === 'audio_data') {
          console.log(`[WebSocket] Received audio data from user ${userId}`);
          
          if (!openaiSession) {
            ws.send(JSON.stringify({
              type: 'error',
              error: 'Session not initialized'
            }));
            return;
          }
          
          // Transcribe the audio
          await openaiSession.transcribeAudio(message.data, message.mimeType || 'audio/webm');
        }
        
      } catch (error) {
        console.error('[WebSocket] Error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }));
      }
    });

    ws.on('close', () => {
      console.log(`[WebSocket] Connection closed for user ${userId}`);
      openaiSession = null;
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
      openaiSession = null;
    });
  });

  console.log('[WebSocket] Voice WebSocket server initialized');
  return wss;
}
