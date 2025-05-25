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

// Mock WASM module for development (comment out when using real WASM)
/*
const BgpWasm = {
  encode_shutdown_message: async (request) => {
    const messageBytes = new TextEncoder().encode(request.message).length;
    
    if (messageBytes <= 255) {
      const totalBytes = 22 + messageBytes;
      const hex = Array(totalBytes).fill(0).map((_, i) => {
        if (i < 16) return 'ff';
        if (i === 16) return '00';
        if (i === 17) return totalBytes.toString(16).padStart(2, '0');
        if (i === 18) return '03';
        if (i === 19) return '06';
        if (i === 20) return request.subcode.toString(16).padStart(2, '0');
        if (i === 21) return messageBytes.toString(16).padStart(2, '0');
        return Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
      }).join(' ');
      
      return {
        hex,
        total_bytes: totalBytes,
        message_bytes: messageBytes
      };
    }
    
    // Multi-chunk response
    const chunks = [];
    const encoder = new TextEncoder();
    let remaining = request.message;
    
    while (remaining.length > 0) {
      let chunkEnd = Math.min(255, remaining.length);
      while (chunkEnd > 0) {
        const testChunk = remaining.substring(0, chunkEnd);
        if (encoder.encode(testChunk).length <= 255) break;
        chunkEnd--;
      }
      
      const chunk = remaining.substring(0, chunkEnd);
      remaining = remaining.substring(chunkEnd);
      
      const chunkBytes = encoder.encode(chunk).length;
      const totalBytes = 22 + chunkBytes;
      
      chunks.push({
        hex: Array(totalBytes).fill(0).map((_, i) => {
          if (i < 16) return 'ff';
          if (i === 16) return '00';
          if (i === 17) return totalBytes.toString(16).padStart(2, '0');
          if (i === 18) return '03';
          if (i === 19) return '06';
          if (i === 20) return request.subcode.toString(16).padStart(2, '0');
          if (i === 21) return chunkBytes.toString(16).padStart(2, '0');
          return Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
        }).join(' '),
        total_bytes: totalBytes,
        message_bytes: chunkBytes
      });
    }
    
    return {
      chunks,
      total_chunks: chunks.length,
      original_bytes: messageBytes
    };
  },
  
  decode_shutdown_message: async (hex) => ({
    subcode: "Administrative Shutdown",
    subcode_value: 2,
    message: "Decoded maintenance message"
  }),
  
  is_hex: (input) => {
    const clean = input.replace(/\s/g, '');
    return clean.length > 0 && 
           clean.length % 2 === 0 && 
           /^[0-9a-fA-F]+$/.test(clean);
  },
  
  get_subcodes: () => [[2, "Administrative Shutdown"], [4, "Administrative Reset"]]
};
*/

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
        { id: 8, type: 'system', text: '  /clear           - Clear screen' },
        { id: 9, type: 'system', text: '  /help            - Show this help' },
        { id: 10, type: 'system', text: '' },
        { id: 11, type: 'system', text: 'Type a message to encode, or paste hex to decode.' },
        { id: 12, type: 'system', text: '───────────────────────────────────────────────────────' },
      ]);
    }
  }, [wasmReady]);

  // Memoized addToHistory to prevent re-creation
  const addToHistory = useCallback((entry) => {
    setHistory(prev => [...prev, { ...entry, id: Date.now() + Math.random() }]);
  }, []);

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
  }, [nickname, asNumber, subcode, getNick, addToHistory]);

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
