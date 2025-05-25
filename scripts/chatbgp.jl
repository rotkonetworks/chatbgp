#!/usr/bin/env julia
using Printf

"""
BGP RFC 9003 Shutdown Communication Encoder/Decoder
Simple chat interface for encoding and decoding shutdown messages
"""

# BGP Constants
const BGP_NOTIFICATION = 3
const BGP_ERROR_CEASE = 6
const BGP_CEASE_ADMIN_SHUTDOWN = 2
const BGP_CEASE_ADMIN_RESET = 4

"""
Encode a text message to RFC 9003 compliant BGP notification hex
"""
function encode_shutdown_message(text::String, subcode::UInt8 = BGP_CEASE_ADMIN_SHUTDOWN)
    # Validate subcode
    if !(subcode in [BGP_CEASE_ADMIN_SHUTDOWN, BGP_CEASE_ADMIN_RESET])
        throw(ArgumentError("Subcode must be 2 (Admin Shutdown) or 4 (Admin Reset)"))
    end
    
    # Convert to UTF-8 bytes
    utf8_bytes = Vector{UInt8}(text)
    
    # Check length constraint (max 255 octets)
    if length(utf8_bytes) > 255
        throw(ArgumentError("Message exceeds 255 bytes (got $(length(utf8_bytes)) bytes)"))
    end
    
    # Build the complete BGP notification message
    message = UInt8[]
    
    # BGP Header (19 bytes)
    append!(message, fill(0xff, 16))  # Marker: 16 bytes of 0xFF
    
    # Calculate total length: header(19) + error(1) + subcode(1) + length(1) + message
    total_length = 19 + 1 + 1 + 1 + length(utf8_bytes)
    push!(message, UInt8((total_length >> 8) & 0xff))  # Length high byte
    push!(message, UInt8(total_length & 0xff))         # Length low byte
    push!(message, BGP_NOTIFICATION)                   # Type: 3
    
    # Notification body
    push!(message, BGP_ERROR_CEASE)                    # Error code: 6
    push!(message, subcode)                            # Subcode: 2 or 4
    push!(message, UInt8(length(utf8_bytes)))          # Message length
    append!(message, utf8_bytes)                        # UTF-8 message
    
    return message
end

"""
Decode RFC 9003 compliant BGP notification hex to text message
"""
function decode_shutdown_message(hex_bytes::Vector{UInt8})
    # Minimum size check
    if length(hex_bytes) < 22
        throw(ArgumentError("Message too short (minimum 22 bytes)"))
    end
    
    # Verify marker (16 bytes of 0xFF)
    if any(b != 0xff for b in hex_bytes[1:16])
        throw(ArgumentError("Invalid BGP marker"))
    end
    
    # Parse header
    msg_length = (UInt16(hex_bytes[17]) << 8) | UInt16(hex_bytes[18])
    msg_type = hex_bytes[19]
    
    if msg_type != BGP_NOTIFICATION
        throw(ArgumentError("Not a notification message (type=$msg_type)"))
    end
    
    # Parse notification
    error_code = hex_bytes[20]
    if error_code != BGP_ERROR_CEASE
        throw(ArgumentError("Not a Cease error (code=$error_code)"))
    end
    
    subcode = hex_bytes[21]
    subcode_name = if subcode == BGP_CEASE_ADMIN_SHUTDOWN
        "Administrative Shutdown"
    elseif subcode == BGP_CEASE_ADMIN_RESET
        "Administrative Reset"
    else
        "Unknown (code=$subcode)"
    end
    
    # Parse shutdown communication
    if length(hex_bytes) < 22
        return (subcode=subcode_name, message="")
    end
    
    text_length = hex_bytes[22]
    
    if text_length == 0
        return (subcode=subcode_name, message="")
    end
    
    if length(hex_bytes) < 22 + text_length
        throw(ArgumentError("Message truncated"))
    end
    
    # Extract and decode UTF-8 message
    msg_bytes = hex_bytes[23:22+text_length]
    
    try
        message = String(msg_bytes)
        return (subcode=subcode_name, message=message)
    catch
        throw(ArgumentError("Invalid UTF-8 in message"))
    end
end

"""
Convert hex string to byte array
"""
function hex_to_bytes(hex_string::String)
    # Remove spaces and validate
    clean_hex = replace(hex_string, " " => "")
    
    if length(clean_hex) % 2 != 0
        throw(ArgumentError("Hex string must have even number of characters"))
    end
    
    bytes = UInt8[]
    for i in 1:2:length(clean_hex)
        try
            push!(bytes, parse(UInt8, clean_hex[i:i+1], base=16))
        catch
            throw(ArgumentError("Invalid hex characters at position $i"))
        end
    end
    
    return bytes
end

"""
Convert byte array to hex string
"""
function bytes_to_hex(bytes::Vector{UInt8})
    return join([@sprintf("%02x", b) for b in bytes], " ")
end

"""
Simple chat interface for encoding/decoding
"""
function bgp_chat()
    println("🌐 BGP RFC 9003 Shutdown Message Encoder/Decoder")
    println("================================================")
    println()
    
    while true
        println("Options:")
        println("1. Encode text → hex (Administrative Shutdown)")
        println("2. Encode text → hex (Administrative Reset)")
        println("3. Decode hex → text")
        println("4. Exit")
        print("\nChoice (1-4): ")
        
        choice = strip(readline())
        println()
        
        if choice == "1" || choice == "2"
            subcode = choice == "1" ? UInt8(BGP_CEASE_ADMIN_SHUTDOWN) : UInt8(BGP_CEASE_ADMIN_RESET)
            subcode_name = choice == "1" ? "Administrative Shutdown" : "Administrative Reset"
            
            print("Enter message (max 255 bytes): ")
            text = readline()
            
            try
                # Show UTF-8 byte count
                utf8_len = length(Vector{UInt8}(text))
                println("\nMessage length: $utf8_len bytes")
                
                # Encode
                hex_bytes = encode_shutdown_message(text, subcode)
                hex_string = bytes_to_hex(hex_bytes)
                
                println("\nEncoded BGP Notification ($subcode_name):")
                println("─" ^ 60)
                println(hex_string)
                println("─" ^ 60)
                println("Total message size: $(length(hex_bytes)) bytes")
                
            catch e
                println("❌ Error: ", e)
            end
            
        elseif choice == "3"
            println("Enter hex bytes (space-separated):")
            hex_input = readline()
            
            try
                # Convert hex to bytes
                bytes = hex_to_bytes(hex_input)
                
                # Decode
                result = decode_shutdown_message(bytes)
                
                println("\nDecoded BGP Notification:")
                println("─" ^ 60)
                println("Type: ", result.subcode)
                println("Message: \"", result.message, "\"")
                println("─" ^ 60)
                
            catch e
                println("❌ Error: ", e)
            end
            
        elseif choice == "4"
            println("Goodbye! 👋")
            break
            
        else
            println("Invalid choice. Please select 1-4.")
        end
        
        println("\nPress Enter to continue...")
        readline()
        println()
    end
end

"""
Quick demo showing the functionality
"""
function demo()
    println("📋 Quick Demo")
    println("=" ^ 60)
    
    # Example 1
    println("\n1. Encoding example:")
    text = "[TICKET-123] Maintenance window - back in 2 hours"
    println("   Text: \"$text\"")
    
    hex_bytes = encode_shutdown_message(text)
    hex_string = bytes_to_hex(hex_bytes)
    println("   Hex:  $hex_string")
    
    # Example 2
    println("\n2. Decoding the same message:")
    decoded = decode_shutdown_message(hex_bytes)
    println("   Type: $(decoded.subcode)")
    println("   Text: \"$(decoded.message)\"")
    
    # Example 3
    println("\n3. Russian text example:")
    russian_text = "Плановые работы - 30 минут"
    println("   Text: \"$russian_text\"")
    println("   UTF-8 bytes: $(length(Vector{UInt8}(russian_text)))")
    
    hex_bytes = encode_shutdown_message(russian_text, BGP_CEASE_ADMIN_RESET)
    println("   Encoded as Admin Reset")
    
    decoded = decode_shutdown_message(hex_bytes)
    println("   Decoded: \"$(decoded.message)\"")
    
    println("\n" * "=" ^ 60)
end

# Main entry point
function main()
    if length(ARGS) > 0 && ARGS[1] == "demo"
        demo()
    else
        bgp_chat()
    end
end

# Run if script is executed directly
if abspath(PROGRAM_FILE) == @__FILE__
    main()
end
