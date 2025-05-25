import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import init, * as BgpWasm from './wasm/chatbgp';

// Import content JSON files
import learnContent from './data/learn-content.json';
import helpContent from './data/help-content.json';
import universalContent from './data/universal-mode.json';

// Memoized terminal line component
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
      case 'universal': return 'text-blue-400';
      case 'universal-header': return 'text-blue-500 font-bold';
      default: return '';
    }
  };

  return <div className={getColor()}>{line.text}</div>;
});

// Memoized header component
const TerminalHeader = memo(({ nickname, asNumber, subcode, mode }) => {
  const getNick = useCallback(() => {
    if (nickname) return nickname;
    if (asNumber) return `AS${asNumber}`;
    return `anon${subcode}`;
  }, [nickname, asNumber, subcode]);

  const getModeDisplay = () => {
    if (mode === 'universal') return 'UNIVERSAL';
    return subcode === 2 ? 'SHUTDOWN' : 'RESET';
  };

  return (
    <div className="bg-gray-900 px-4 py-2 flex items-center justify-between border-b border-green-900">
      <div className="flex items-center gap-4">
        <span className="text-green-500">CHATBGP</span>
        <span className="text-gray-500">|</span>
        <span className="text-yellow-400">{getNick()}</span>
        {asNumber && <span className="text-gray-600">[AS{asNumber}]</span>}
      </div>
      <div className="text-gray-600">
        Mode: {getModeDisplay()}
      </div>
    </div>
  );
});

export default function ChatBGP() {
  const [wasmReady, setWasmReady] = useState(false);
  const [nickname, setNickname] = useState('');
  const [asNumber, setAsNumber] = useState('');
  const [subcode, setSubcode] = useState(2);
  const [mode, setMode] = useState('shutdown'); // 'shutdown' or 'universal'
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
      addToHistory({ type: 'error', text: `WASM initialization failed: ${err.message}` });
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
  }, [history.length]);

  // Memoized addToHistory
  const addToHistory = useCallback((entry) => {
    setHistory(prev => [...prev, { ...entry, id: Date.now() + Math.random() }]);
  }, []);

  // Initialize welcome message
  useEffect(() => {
    if (wasmReady) {
      const welcomeMessages = helpContent.welcome.map((text, index) => ({
        id: index,
        type: 'system',
        text
      }));

      const commandMessages = [
        { type: 'system', text: '' },
        { type: 'system', text: 'Commands:' },
        ...helpContent.commands.map(cmd => ({
          type: 'system',
          text: `  ${cmd.command.padEnd(15)} - ${cmd.description}`
        })),
        { type: 'system', text: '' },
        { type: 'system', text: helpContent.usage.encoding },
        { type: 'system', text: '───────────────────────────────────────────────────────' }
      ];

      setHistory([...welcomeMessages, ...commandMessages]);
    }
  }, [wasmReady]);

  // Content display functions
  const showLearnContent = useCallback(() => {
    const contentLines = [];
    
    // Header
    contentLines.push({ type: 'learn', text: '' });
    contentLines.push(learnContent.header);
    contentLines.push({ type: 'learn', text: '' });

    // Sections
    learnContent.sections.forEach(section => {
      contentLines.push({ type: section.type, text: section.title });
      section.content.forEach(item => {
        contentLines.push(item);
      });
      contentLines.push({ type: 'learn', text: '' });
    });

    // Footer
    contentLines.push(learnContent.footer);

    contentLines.forEach(line => addToHistory(line));
  }, [addToHistory]);

  const showUniversalHelp = useCallback(() => {
    universalContent.help.forEach(line => {
      addToHistory({ type: 'universal', text: line });
    });
  }, [addToHistory]);

  // Command handlers
  const handleShutdownCommand = useCallback(async (cmd) => {
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

      case '/universal':
        setMode('universal');
        addToHistory({ type: 'system', text: '* Switched to universal BGP notification mode' });
        showUniversalHelp();
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
          ...helpContent.commands.map(cmd => ({
            type: 'system',
            text: `  ${cmd.command.padEnd(15)} - ${cmd.description}`
          })),
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
  }, [nickname, asNumber, subcode, getNick, addToHistory, showLearnContent, showUniversalHelp]);

  const handleUniversalCommand = useCallback(async (cmd) => {
    const parts = cmd.split(' ');
    const command = parts[0].toLowerCase();

    switch (command) {
      case '/encode':
        if (parts.length < 3) {
          addToHistory({ type: 'error', text: 'Usage: /encode <error_code> <subcode> [data_type] [value]' });
          return;
        }

        const errorCode = parseInt(parts[1]);
        const subcodeValue = parseInt(parts[2]);
        const dataType = parts[3] || '';
        const dataValue = parts.slice(4).join(' ') || '';

        try {
          const result = await BgpWasm.create_notification_with_data(
            errorCode, 
            subcodeValue, 
            dataType, 
            dataValue
          );

          const errorName = universalContent.error_codes[errorCode]?.name || 'Unknown';
          const subcodeName = universalContent.error_codes[errorCode]?.subcodes[subcodeValue] || 'Unknown';

          addToHistory({ type: 'output', text: `┌─ BGP NOTIFICATION ─────────────────────────────────┐` });
          addToHistory({ type: 'output', text: `│ Error: ${errorCode} (${errorName})` });
          addToHistory({ type: 'output', text: `│ Subcode: ${subcodeValue} (${subcodeName})` });
          addToHistory({ type: 'hex', text: result.hex });
          addToHistory({ type: 'output', text: `└─ ${result.total_bytes} bytes total ────────────────────────────┘` });
        } catch (error) {
          addToHistory({ type: 'error', text: `Encoding error: ${error.message || error}` });
        }
        break;

      case '/shutdown':
        setMode('shutdown');
        addToHistory({ type: 'system', text: '* Switched back to shutdown message mode' });
        break;

      case '/help':
        showUniversalHelp();
        break;

      case '/clear':
        setHistory([]);
        break;

      // Forward other commands to shutdown handler
      default:
        await handleShutdownCommand(cmd);
    }
  }, [addToHistory, showUniversalHelp, handleShutdownCommand]);

  // Main input processing
  const processInput = useCallback(async (text) => {
    if (!text.trim()) return;

    setCommandHistory(prev => [...prev, text]);
    setHistoryIndex(-1);

    addToHistory({ type: 'input', text: `<${getNick()}> ${text}` });

    if (text.startsWith('/')) {
      if (mode === 'universal') {
        await handleUniversalCommand(text);
      } else {
        await handleShutdownCommand(text);
      }
      return;
    }

    try {
      const cleanedText = text.trim();
      const isHex = BgpWasm.is_hex(cleanedText);

      if (isHex) {
        addToHistory({ type: 'system', text: '* Decoding BGP notification...' });
        
        try {
          // Try universal decoder first
          const result = await BgpWasm.decode_universal_notification(cleanedText);
          
          addToHistory({ type: 'output', text: '┌─ DECODED BGP NOTIFICATION ─────────────────────────┐' });
          addToHistory({ type: 'output', text: `│ Error: ${result.error_code} (${result.error_name})` });
          addToHistory({ type: 'output', text: `│ Subcode: ${result.subcode} (${result.subcode_name})` });
          addToHistory({ type: 'output', text: `│ Data: ${result.data_length} bytes` });
          if (result.interpretation) {
            addToHistory({ type: 'output', text: `│ Info: ${result.interpretation}` });
          }
          addToHistory({ type: 'output', text: '└────────────────────────────────────────────────────┘' });
        } catch (universalError) {
          // Fall back to shutdown decoder
          try {
            const result = await BgpWasm.decode_shutdown_message(cleanedText);
            addToHistory({ type: 'output', text: '┌─ DECODED BGP SHUTDOWN NOTIFICATION ────────────────┐' });
            addToHistory({ type: 'output', text: `│ Type: ${result.subcode} (${result.subcode_value})` });
            addToHistory({ type: 'output', text: `│ Message: "${result.message}"` });
            addToHistory({ type: 'output', text: '└────────────────────────────────────────────────────┘' });
          } catch (shutdownError) {
            addToHistory({ type: 'error', text: `Decoding error: ${shutdownError.message || shutdownError}` });
          }
        }
      } else {
        // Encoding mode
        if (mode === 'universal') {
          addToHistory({ type: 'error', text: 'In universal mode, use /encode command to create notifications' });
          return;
        }

        const bytes = new TextEncoder().encode(text).length;
        if (bytes > 255) {
          addToHistory({ type: 'error', text: `Message too long: ${bytes} bytes (max 255)` });
          return;
        }

        addToHistory({ type: 'system', text: `* Encoding message (${bytes}/255 bytes)...` });

        const request = { message: text, subcode };
        const result = await BgpWasm.encode_shutdown_message(request);

        const modeText = subcode === 2 ? 'SHUTDOWN' : 'RESET';
        addToHistory({ type: 'output', text: `┌─ BGP ${modeText} NOTIFICATION ────────────────────────┐` });
        addToHistory({ type: 'hex', text: result.hex });
        addToHistory({ type: 'output', text: `└─ ${result.total_bytes} bytes total, ${result.message_bytes} bytes message ─────────┘` });
      }
    } catch (error) {
      addToHistory({ type: 'error', text: `ERROR: ${error.message || error}` });
    }
  }, [getNick, subcode, mode, addToHistory, handleUniversalCommand, handleShutdownCommand]);

  // Keyboard handling
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
      <TerminalHeader nickname={nickname} asNumber={asNumber} subcode={subcode} mode={mode} />

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
          placeholder={mode === 'universal' ? 
            "Type /encode or hex to decode, /help for commands" : 
            "Type message or hex, or /help for commands"
          }
          autoFocus
        />
      </div>
    </div>
  );
}
