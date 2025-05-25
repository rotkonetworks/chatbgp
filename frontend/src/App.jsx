import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import init, * as BgpWasm from './wasm/chatbgp';

// Memoized terminal line component - only re-renders if its specific line changes
const TerminalLine = memo(({ line }) => {
  const getColor = () => {
    switch (line.type) {
      case 'system': return 'text-gray-500';
      case 'error': return 'text-red-400';
      case 'input': return 'text-green-400';
      case 'output': return 'text-cyan-400';
      case 'hex': return 'text-yellow-300 break-all font-mono text-xs';
      case 'learn': return 'text-purple-400';
      case 'learn-header': return 'text-purple-500 font-bold';
      case 'learn-code': return 'text-orange-400 font-mono bg-gray-900 px-2 py-1 rounded';
      default: return '';
    }
  };

  return <div className={getColor()}>{line.text}</div>;
});

// Memoized header component - only re-renders when nick/as/subcode change
const TerminalHeader = memo(({ nickname, asNumber, subcode }) => {
  const getNick = useCallback(() => {
    if (nickname) return nickname;
    if (asNumber) return `AS${asNumber}`;
    return `anon${subcode}`;
  }, [nickname, asNumber, subcode]);

  return (
    <div className="bg-gray-900 px-4 py-2 flex items-center justify-between border-b border-green-900">
      <div className="flex items-center gap-4">
        <span className="text-green-500">CHATBGP</span>
        <span className="text-gray-500">|</span>
        <span className="text-yellow-400">{getNick()}</span>
        {asNumber && <span className="text-gray-600">[AS{asNumber}]</span>}
      </div>
      <div className="text-gray-600">
        Mode: {subcode === 2 ? 'SHUTDOWN' : 'RESET'}
      </div>
    </div>
  );
});

export default function ChatBGP() {
  const [wasmReady, setWasmReady] = useState(false);
  const [nickname, setNickname] = useState('');
  const [asNumber, setAsNumber] = useState('');
  const [subcode, setSubcode] = useState(2);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const terminalRef = useRef(null);
  const inputRef = useRef(null);
  const historyEndRef = useRef(null);

  // Initialize WASM
  useEffect(() => {
    init().then(() => {
      setWasmReady(true);
    }).catch(err => {
      console.error('Failed to initialize WASM:', err);
      // Optionally set an error state here
    });
  }, []);

  // Memoized getNick function
  const getNick = useCallback(() => {
    if (nickname) return nickname;
    if (asNumber) return `AS${asNumber}`;
    return `anon${subcode}`;
  }, [nickname, asNumber, subcode]);

  // Auto-scroll optimization
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [history.length]); // Only depend on array length, not content

  // Initialize welcome message only once
  useEffect(() => {
    if (wasmReady) {
      setHistory([
        { id: 0, type: 'system', text: '═══════════════════════════════════════════════════════' },
        { id: 1, type: 'system', text: ' CHATBGP - RFC 9003 SHUTDOWN MESSAGE ENCODER/DECODER v1.0' },
        { id: 2, type: 'system', text: '═══════════════════════════════════════════════════════' },
        { id: 3, type: 'system', text: '' },
        { id: 4, type: 'system', text: 'Commands:' },
        { id: 5, type: 'system', text: '  /nick <n>        - Set nickname (0 to clear)' },
        { id: 6, type: 'system', text: '  /as <number>     - Set AS number (0 to clear)' },
        { id: 7, type: 'system', text: '  /mode <2|4>      - Set BGP subcode (2=shutdown, 4=reset)' },
        { id: 8, type: 'system', text: '  /learn           - Learn about RFC 9003 BGP shutdown messages' },
        { id: 9, type: 'system', text: '  /clear           - Clear screen' },
        { id: 10, type: 'system', text: '  /help            - Show this help' },
        { id: 11, type: 'system', text: '' },
        { id: 12, type: 'system', text: 'Type a message to encode, or paste hex to decode.' },
        { id: 13, type: 'system', text: '───────────────────────────────────────────────────────' },
      ]);
    }
  }, [wasmReady]);

  // Memoized addToHistory to prevent re-creation
  const addToHistory = useCallback((entry) => {
    setHistory(prev => [...prev, { ...entry, id: Date.now() + Math.random() }]);
  }, []);

  const showLearnContent = useCallback(() => {
    const learnContent = [
      { type: 'learn-header', text: '═══ RFC 9003: BGP Cease NOTIFICATION Subcode for Shutdown ═══' },
      { type: 'learn', text: '' },
      { type: 'learn-header', text: '📚 What is RFC 9003?' },
      { type: 'learn', text: 'RFC 9003 (published Feb 2021) adds human-readable shutdown messages to BGP.' },
      { type: 'learn', text: 'Before this, operators had to guess why a BGP session was shut down.' },
      { type: 'learn', text: '' },
      { type: 'learn-header', text: '🔧 How BGP Messages Work:' },
      { type: 'learn', text: '1. All BGP messages start with a 19-byte header:' },
      { type: 'learn-code', text: '   • Marker: 16 bytes of 0xFF (synchronization)' },
      { type: 'learn-code', text: '   • Length: 2 bytes (total message size, big-endian)' },
      { type: 'learn-code', text: '   • Type: 1 byte (1=OPEN, 2=UPDATE, 3=NOTIFICATION, 4=KEEPALIVE)' },
      { type: 'learn', text: '' },
      { type: 'learn-header', text: '🚨 NOTIFICATION Messages (Type 3):' },
      { type: 'learn', text: 'Used to report errors and close BGP connections. Structure:' },
      { type: 'learn-code', text: '   • Error Code: 1 byte (6 = Cease)' },
      { type: 'learn-code', text: '   • Subcode: 1 byte (2 = Admin Shutdown, 4 = Admin Reset)' },
      { type: 'learn-code', text: '   • Data: Variable length (RFC 9003 adds UTF-8 message here!)' },
      { type: 'learn', text: '' },
      { type: 'learn-header', text: '💬 RFC 9003 Shutdown Communication:' },
      { type: 'learn', text: 'The shutdown message is encoded as:' },
      { type: 'learn-code', text: '   • Length: 1 byte (0-255, size of UTF-8 message)' },
      { type: 'learn-code', text: '   • Message: UTF-8 encoded text (max 255 bytes)' },
      { type: 'learn', text: '' },
      { type: 'learn-header', text: '📐 Complete Message Structure:' },
      { type: 'learn-code', text: '[Marker:16][Length:2][Type:1][Error:1][Subcode:1][MsgLen:1][UTF8-Message:0-255]' },
      { type: 'learn', text: 'Total size: 22 bytes minimum (empty message) to 277 bytes maximum' },
      { type: 'learn', text: '' },
      { type: 'learn-header', text: '🌍 Real-World Usage:' },
      { type: 'learn', text: '• "Upgrading to 1.2.3, back in 30min" - Planned maintenance' },
      { type: 'learn', text: '• "[TICKET-123] Emergency fiber cut repair" - Unplanned outage' },
      { type: 'learn', text: '• "Moving to new peer AS64512" - Configuration change' },
      { type: 'learn', text: '' },
      { type: 'learn-header', text: '💡 Fun Facts:' },
      { type: 'learn', text: '• UTF-8 support means emojis work! "Maintenance 🔧"' },
      { type: 'learn', text: '• Cyrillic, Chinese, Arabic all supported' },
      { type: 'learn', text: '• 255 bytes ≈ 255 ASCII chars, but only ~85 Chinese chars' },
      { type: 'learn', text: '• Helps network operators worldwide communicate better' },
      { type: 'learn', text: '' },
      { type: 'learn-header', text: '⚠️  Why Only Subcodes 2 & 4? (The Hard Truth)' },
      { type: 'learn', text: 'BGP NOTIFICATION messages are nuclear options - they ALWAYS kill the session.' },
      { type: 'learn', text: 'This isn\'t a bug, it\'s a feature. Here\'s why:' },
      { type: 'learn', text: '' },
      { type: 'learn', text: '1. BGP is paranoid by design. Config mismatch? Dead session. Bad message? Dead.' },
      { type: 'learn', text: '   Hold timer expired? Dead. Any error? Dead. No exceptions.' },
      { type: 'learn', text: '' },
      { type: 'learn', text: '2. "Just send a warning" is how you get routing loops and blackholes.' },
      { type: 'learn', text: '   The Internet works because BGP fails closed, not open.' },
      { type: 'learn', text: '' },
      { type: 'learn', text: '3. RFC 9003 only covers Admin Shutdown/Reset because those are the ONLY cases' },
      { type: 'learn', text: '   where you\'re intentionally killing a working session. Every other' },
      { type: 'learn', text: '   NOTIFICATION is BGP saying "something is broken, I\'m out."' },
      { type: 'learn', text: '' },
      { type: 'learn-header', text: '📊 All BGP Error Codes (All Fatal):' },
      { type: 'learn-code', text: '1: Message Header Error - Malformed message, probable attack' },
      { type: 'learn-code', text: '2: OPEN Message Error - Config mismatch, AS numbers wrong' },
      { type: 'learn-code', text: '3: UPDATE Message Error - Bad routes, potential hijack' },
      { type: 'learn-code', text: '4: Hold Timer Expired - Peer is dead or network is' },
      { type: 'learn-code', text: '5: FSM Error - State machine broken, memory corruption?' },
      { type: 'learn-code', text: '6: Cease - Voluntary termination (only 2 & 4 get messages)' },
      { type: 'learn', text: '' },
      { type: 'learn', text: 'Want to tell your peer their config is wrong without dropping?' },
      { type: 'learn', text: 'Use email. Or phone. Or literally anything except BGP.' },
      { type: 'learn', text: '' },
      { type: 'learn', text: 'BGP\'s job is moving packets, not messages. It speaks in routes and' },
      { type: 'learn', text: 'silence. When it does speak (NOTIFICATION), someone\'s day is ruined.' },
      { type: 'learn', text: '' },
      { type: 'learn', text: 'This is good design. Complexity is where bugs hide, and bugs in BGP' },
      { type: 'learn', text: 'mean the Internet breaks. Keep it simple, keep it brutal.' },
      { type: 'learn', text: '' },
      { type: 'learn-header', text: '🧮 Example Encoding:' },
      { type: 'learn', text: 'Message: "Test" (4 bytes) with subcode 2:' },
      { type: 'learn-code', text: 'ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff  [Marker]' },
      { type: 'learn-code', text: '00 1a                                              [Length: 26]' },
      { type: 'learn-code', text: '03                                                 [Type: NOTIFICATION]' },
      { type: 'learn-code', text: '06                                                 [Error: Cease]' },
      { type: 'learn-code', text: '02                                                 [Subcode: Admin Shutdown]' },
      { type: 'learn-code', text: '04                                                 [Message Length: 4]' },
      { type: 'learn-code', text: '54 65 73 74                                        [UTF-8: "Test"]' },
      { type: 'learn', text: '' },
      { type: 'learn', text: '═══════════════════════════════════════════════════════════════' },
    ];

    learnContent.forEach(line => addToHistory(line));
  }, [addToHistory]);

  const handleCommand = useCallback(async (cmd) => {
    const parts = cmd.split(' ');
    const command = parts[0].toLowerCase();

    switch (command) {
      case '/nick':
        if (!parts[1]) {
          addToHistory({ type: 'error', text: 'Usage: /nick <n> (use 0 to clear)' });
        } else if (parts[1] === '0') {
          setNickname('');
          addToHistory({ type: 'system', text: '* Nickname cleared, back to anonymous mode' });
        } else {
          setNickname(parts[1]);
          addToHistory({ type: 'system', text: `* Nickname set to: ${parts[1]}` });
        }
        break;

      case '/as':
        if (!parts[1]) {
          addToHistory({ type: 'error', text: 'Usage: /as <number> (use 0 to clear)' });
        } else if (parts[1] === '0') {
          setAsNumber('');
          addToHistory({ type: 'system', text: '* AS number cleared (AS0 is reserved)' });
        } else if (/^\d+$/.test(parts[1])) {
          setAsNumber(parts[1]);
          addToHistory({ type: 'system', text: `* AS number set to: ${parts[1]}` });
        } else {
          addToHistory({ type: 'error', text: 'Error: AS number must be numeric' });
        }
        break;

      case '/mode':
        if (parts[1] === '2' || parts[1] === '4') {
          setSubcode(parseInt(parts[1]));
          const modeName = parts[1] === '2' ? 'Administrative Shutdown' : 'Administrative Reset';
          addToHistory({ type: 'system', text: `* Mode set to: ${modeName} (${parts[1]})` });
        } else {
          addToHistory({ type: 'error', text: 'Usage: /mode <2|4> (2=shutdown, 4=reset)' });
        }
        break;

      case '/learn':
        showLearnContent();
        break;

      case '/clear':
        setHistory([]);
        break;

      case '/help':
        const helpMessages = [
          { type: 'system', text: '───────────────────────────────────────────────────────' },
          { type: 'system', text: 'Commands:' },
          { type: 'system', text: '  /nick <n>        - Set nickname (0 to clear)' },
          { type: 'system', text: '  /as <number>     - Set AS number (0 to clear)' },
          { type: 'system', text: '  /mode <2|4>      - Set BGP subcode' },
          { type: 'system', text: '  /learn           - Learn about RFC 9003' },
          { type: 'system', text: '  /clear           - Clear screen' },
          { type: 'system', text: '  /help            - Show this help' },
          { type: 'system', text: '' },
          { type: 'system', text: 'Current state:' },
          { type: 'system', text: `  Nick: ${nickname || '(none - anonymous)'} ` },
          { type: 'system', text: `  AS: ${asNumber || '(none)'} ` },
          { type: 'system', text: `  Mode: ${subcode === 2 ? 'Shutdown (2)' : 'Reset (4)'} ` },
          { type: 'system', text: `  Display: <${getNick()}>` },
          { type: 'system', text: '───────────────────────────────────────────────────────' }
        ];
        helpMessages.forEach(msg => addToHistory(msg));
        break;

      default:
        addToHistory({ type: 'error', text: `Unknown command: ${command}` });
    }
  }, [nickname, asNumber, subcode, getNick, addToHistory, showLearnContent]);

  const processInput = useCallback(async (text) => {
    if (!text.trim()) return;

    setCommandHistory(prev => [...prev, text]);
    setHistoryIndex(-1);

    addToHistory({ type: 'input', text: `<${getNick()}> ${text}` });

    if (text.startsWith('/')) {
      await handleCommand(text);
      return;
    }

    try {
      const isHex = BgpWasm.is_hex(text);

      if (isHex) {
        addToHistory({ type: 'system', text: '* Decoding BGP notification...' });
        const result = await BgpWasm.decode_shutdown_message(text);

        addToHistory({ type: 'output', text: '┌─ DECODED BGP NOTIFICATION ─────────────────────────┐' });
        addToHistory({ type: 'output', text: `│ Type: ${result.subcode} (${result.subcode_value})` });
        addToHistory({ type: 'output', text: `│ Message: "${result.message}"` });
        addToHistory({ type: 'output', text: '└────────────────────────────────────────────────────┘' });
      } else {
        const bytes = new TextEncoder().encode(text).length;

        if (bytes <= 255) {
          addToHistory({ type: 'system', text: `* Encoding message (${bytes}/255 bytes)...` });
        } else {
          addToHistory({ type: 'system', text: `* Message too long (${bytes} bytes), splitting into chunks...` });
        }

        const request = { message: text, subcode };
        const result = await BgpWasm.encode_shutdown_message(request);

        const modeText = subcode === 2 ? 'SHUTDOWN' : 'RESET';

        if (result.hex) {
          addToHistory({ type: 'output', text: `┌─ BGP ${modeText} NOTIFICATION ────────────────────────┐` });
          addToHistory({ type: 'hex', text: result.hex });
          addToHistory({ type: 'output', text: `└─ ${result.total_bytes} bytes total, ${result.message_bytes} bytes message ─────────┘` });
        } else if (result.chunks) {
          addToHistory({ type: 'system', text: `* Split into ${result.total_chunks} chunks (original: ${result.original_bytes} bytes)` });

          result.chunks.forEach((chunk, i) => {
            addToHistory({ type: 'output', text: `┌─ BGP ${modeText} NOTIFICATION [${i + 1}/${result.total_chunks}] ─────────────┐` });
            addToHistory({ type: 'hex', text: chunk.hex });
            addToHistory({ type: 'output', text: `└─ ${chunk.total_bytes} bytes total, ${chunk.message_bytes} bytes message ─────────┘` });
          });
        }
      }
    } catch (error) {
      addToHistory({ type: 'error', text: `ERROR: ${error.message || error}` });
    }
  }, [getNick, subcode, handleCommand, addToHistory]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      processInput(input);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  }, [input, commandHistory, historyIndex, processInput]);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  if (!wasmReady) {
    return (
      <div className="bg-black text-green-400 h-screen flex items-center justify-center font-mono">
        <div className="animate-pulse">Loading ChatBGP encoder...</div>
      </div>
    );
  }

  return (
    <div className="bg-black text-green-400 h-screen flex flex-col font-mono text-sm" onClick={focusInput}>
      <TerminalHeader nickname={nickname} asNumber={asNumber} subcode={subcode} />

      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto p-4 space-y-1"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#065f46 #000' }}
      >
        {history.map((entry) => (
          <TerminalLine key={entry.id} line={entry} />
        ))}
        <div ref={historyEndRef} />
      </div>

      <div className="border-t border-green-900 px-4 py-2 flex items-center">
        <span className="text-green-500 mr-2">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent outline-none text-green-400"
          placeholder="Type message or hex, or /help for commands"
          autoFocus
        />
      </div>
    </div>
  );
}
