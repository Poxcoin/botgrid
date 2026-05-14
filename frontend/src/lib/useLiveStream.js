import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Real-time feed hook — connects to /ws/live and keeps positions, balance,
 * open orders and trade history in sync without polling.
 *
 * Protocol:
 *   init   → full snapshot  (positions, balance, orders, trades[500])
 *   update → diff every 2s  (positions, balance, orders, new_trades)
 *
 * Reconnects automatically with 3-second back-off.
 */
export function useLiveStream() {
  const [positions,  setPositions]  = useState([]);
  const [balance,    setBalance]    = useState(null);
  const [openOrders, setOpenOrders] = useState([]);
  const [trades,     setTrades]     = useState([]);
  const [connected,  setConnected]  = useState(false);
  const [ts,         setTs]         = useState(null);

  const wsRef        = useRef(null);
  const reconnectRef = useRef(null);
  const mountedRef   = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    const token = localStorage.getItem('kado_token');
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host  = window.location.host;
    const url   = `${proto}//${host}/ws/live?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      setConnected(true);
    };

    ws.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'init') {
          setPositions(msg.positions  ?? []);
          setBalance(msg.balance      ?? null);
          setOpenOrders(msg.orders    ?? []);
          setTrades(msg.trades        ?? []);
          setTs(msg.ts);
        } else if (msg.type === 'update') {
          setPositions(msg.positions  ?? []);
          setBalance(msg.balance      ?? null);
          setOpenOrders(msg.orders    ?? []);
          if (msg.new_trades?.length) {
            setTrades(prev => {
              const existingIds = new Set(prev.map(t => t.id));
              const fresh = msg.new_trades.filter(t => !existingIds.has(t.id));
              return fresh.length ? [...fresh, ...prev] : prev;
            });
          }
          setTs(msg.ts);
        }
      } catch {}
    };

    ws.onclose = (ev) => {
      if (!mountedRef.current) return;
      setConnected(false);
      // 4001 = auth error — don't reconnect (token invalid/expired)
      if (ev.code === 4001) return;
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {};
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { positions, balance, openOrders, trades, connected, ts };
}
