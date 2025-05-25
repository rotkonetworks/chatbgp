use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

// Constants - use explicit typing to prevent integer overflow
const BGP_MARKER: [u8; 16] = [0xff; 16];
const BGP_HEADER_LEN: usize = 19;
const BGP_NOTIFICATION: u8 = 3;
const BGP_ERROR_CEASE: u8 = 6;
const BGP_CEASE_ADMIN_SHUTDOWN: u8 = 2;
const BGP_CEASE_ADMIN_RESET: u8 = 4;
const MAX_SHUTDOWN_MSG_LEN: usize = 255;
const MIN_NOTIFICATION_LEN: usize = 21;
const MAX_BGP_MESSAGE_LEN: usize = 4096; // RFC 4271 limit

// Existing structures (unchanged for compatibility)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[wasm_bindgen]
pub enum BgpCeaseSubcode {
    AdminShutdown = 2,
    AdminReset = 4,
}

impl BgpCeaseSubcode {
    #[inline(always)]
    fn from_u8(value: u8) -> Option<Self> {
        match value {
            BGP_CEASE_ADMIN_SHUTDOWN => Some(BgpCeaseSubcode::AdminShutdown),
            BGP_CEASE_ADMIN_RESET => Some(BgpCeaseSubcode::AdminReset),
            _ => None,
        }
    }

    #[inline(always)]
    fn as_str(&self) -> &'static str {
        match self {
            BgpCeaseSubcode::AdminShutdown => "Administrative Shutdown",
            BgpCeaseSubcode::AdminReset => "Administrative Reset",
        }
    }
}

// Request/Response structures with proper bounds checking
#[derive(Serialize, Deserialize)]
pub struct EncodeRequest {
    pub message: String,
    pub subcode: u8,
}

#[derive(Serialize, Deserialize)]
pub struct EncodeResponse {
    pub hex: String,
    pub total_bytes: usize,
    pub message_bytes: usize,
}

#[derive(Serialize, Deserialize)]
pub struct DecodeResponse {
    pub subcode: String,
    pub subcode_value: u8,
    pub message: String,
}

#[derive(Serialize, Deserialize)]
pub struct UniversalEncodeRequest {
    pub error_code: u8,
    pub subcode: u8,
    pub data: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
pub struct UniversalDecodeResponse {
    pub error_code: u8,
    pub error_name: String,
    pub subcode: u8,
    pub subcode_name: String,
    pub data_length: usize,
    pub data_hex: String,
    pub interpretation: String,
}

// Secure integer parsing with explicit bounds checking
fn parse_u8_bounded(s: &str, min: u8, max: u8, context: &str) -> Result<u8, String> {
    let val: u8 = s.parse()
        .map_err(|_| format!("Invalid {} value: must be a number", context))?;
    if val < min || val > max {
        return Err(format!("{} must be between {} and {}", context, min, max));
    }
    Ok(val)
}

fn parse_u16_bounded(s: &str, min: u16, max: u16, context: &str) -> Result<u16, String> {
    let val: u16 = s.parse()
        .map_err(|_| format!("Invalid {} value: must be a number", context))?;
    if val < min || val > max {
        return Err(format!("{} must be between {} and {}", context, min, max));
    }
    Ok(val)
}

// Secure hex parsing with bounds checking
fn parse_hex_bounded(hex_str: &str, max_bytes: usize) -> Result<Vec<u8>, String> {
    let clean: String = hex_str.chars()
        .filter(|c| !c.is_whitespace() && *c != ':' && *c != '-')
        .collect();
    
    if clean.is_empty() {
        return Ok(Vec::new());
    }
    
    if clean.len() % 2 != 0 {
        return Err("Hex string must have even number of characters".to_string());
    }
    
    let byte_count = clean.len() / 2;
    if byte_count > max_bytes {
        return Err(format!("Hex data too long: {} bytes (max {})", byte_count, max_bytes));
    }
    
    let mut bytes = Vec::with_capacity(byte_count);
    for i in (0..clean.len()).step_by(2) {
        let byte_str = &clean[i..i+2];
        let byte = u8::from_str_radix(byte_str, 16)
            .map_err(|_| format!("Invalid hex character in: {}", byte_str))?;
        bytes.push(byte);
    }
    
    Ok(bytes)
}

// Secure BGP message validation
fn validate_bgp_message(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < MIN_NOTIFICATION_LEN {
        return Err(format!("Message too short: {} bytes (minimum {})", 
                          bytes.len(), MIN_NOTIFICATION_LEN));
    }
    
    if bytes.len() > MAX_BGP_MESSAGE_LEN {
        return Err(format!("Message too long: {} bytes (maximum {})", 
                          bytes.len(), MAX_BGP_MESSAGE_LEN));
    }
    
    // Validate BGP marker
    if !bytes[..16].iter().all(|&b| b == 0xff) {
        return Err("Invalid BGP marker: must be 16 bytes of 0xFF".to_string());
    }
    
    // Validate length field
    let declared_length = ((bytes[16] as usize) << 8) | (bytes[17] as usize);
    if declared_length != bytes.len() {
        return Err(format!("Length mismatch: header declares {} bytes, got {}", 
                          declared_length, bytes.len()));
    }
    
    if declared_length < MIN_NOTIFICATION_LEN || declared_length > MAX_BGP_MESSAGE_LEN {
        return Err(format!("Invalid declared length: {} (must be {}-{})", 
                          declared_length, MIN_NOTIFICATION_LEN, MAX_BGP_MESSAGE_LEN));
    }
    
    // Validate message type
    if bytes[18] != BGP_NOTIFICATION {
        return Err(format!("Not a notification message: type {} (expected {})", 
                          bytes[18], BGP_NOTIFICATION));
    }
    
    Ok(())
}

// Main encode function (backward compatible)
#[wasm_bindgen]
pub fn encode_shutdown_message(request: JsValue) -> Result<JsValue, JsValue> {
    let req: EncodeRequest = serde_wasm_bindgen::from_value(request)
        .map_err(|e| JsValue::from_str(&format!("Invalid request: {}", e)))?;

    let _subcode = BgpCeaseSubcode::from_u8(req.subcode)
        .ok_or_else(|| JsValue::from_str("Invalid subcode: must be 2 or 4"))?;

    let utf8_bytes = req.message.as_bytes();
    if utf8_bytes.len() > MAX_SHUTDOWN_MSG_LEN {
        return Err(JsValue::from_str(&format!(
            "Message exceeds {} bytes (got {})", MAX_SHUTDOWN_MSG_LEN, utf8_bytes.len()
        )));
    }

    // Calculate total length with overflow check
    let data_len = utf8_bytes.len() + 1; // +1 for length byte
    let total_len = BGP_HEADER_LEN.checked_add(2) // error + subcode
        .and_then(|n| n.checked_add(data_len))
        .ok_or_else(|| JsValue::from_str("Message too large"))?;
    
    if total_len > MAX_BGP_MESSAGE_LEN {
        return Err(JsValue::from_str("Message would exceed BGP maximum length"));
    }

    let mut message = Vec::with_capacity(total_len);
    message.extend_from_slice(&BGP_MARKER);
    
    let total_length = total_len as u16;
    message.push((total_length >> 8) as u8);
    message.push((total_length & 0xff) as u8);
    message.push(BGP_NOTIFICATION);
    message.push(BGP_ERROR_CEASE);
    message.push(req.subcode);
    message.push(utf8_bytes.len() as u8);
    message.extend_from_slice(utf8_bytes);

    let response = EncodeResponse {
        hex: to_hex(&message),
        total_bytes: message.len(),
        message_bytes: utf8_bytes.len(),
    };

    serde_wasm_bindgen::to_value(&response)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

// Main decode function (backward compatible)
#[wasm_bindgen]
pub fn decode_shutdown_message(hex_input: &str) -> Result<JsValue, JsValue> {
    let clean: String = hex_input.chars()
        .filter(|c| !c.is_whitespace() && *c != ':' && *c != '-')
        .collect();

    let bytes = parse_hex_bounded(&clean, MAX_BGP_MESSAGE_LEN)
        .map_err(|e| JsValue::from_str(&e))?;

    validate_bgp_message(&bytes)
        .map_err(|e| JsValue::from_str(&e))?;

    let error_code = bytes[19];
    if error_code != BGP_ERROR_CEASE {
        return Err(JsValue::from_str(&format!(
            "Not a Cease error (code={})", error_code
        )));
    }

    let subcode = bytes[20];
    let subcode_enum = BgpCeaseSubcode::from_u8(subcode)
        .ok_or_else(|| JsValue::from_str(&format!("Unknown subcode: {}", subcode)))?;

    if bytes.len() < 22 {
        return Err(JsValue::from_str("Missing shutdown message length byte"));
    }

    let text_length = bytes[21] as usize;
    let expected_total = MIN_NOTIFICATION_LEN + text_length;
    
    if bytes.len() != expected_total {
        return Err(JsValue::from_str(&format!(
            "Length mismatch: expected {} bytes, got {}", expected_total, bytes.len()
        )));
    }

    let message = if text_length == 0 {
        String::new()
    } else {
        let msg_bytes = &bytes[22..22 + text_length];
        std::str::from_utf8(msg_bytes)
            .map_err(|_| JsValue::from_str("Invalid UTF-8 in message"))?
            .to_string()
    };

    let response = DecodeResponse {
        subcode: subcode_enum.as_str().to_string(),
        subcode_value: subcode,
        message,
    };

    serde_wasm_bindgen::to_value(&response)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

// Universal encoder with proper validation
#[wasm_bindgen]
pub fn encode_universal_notification(request: JsValue) -> Result<JsValue, JsValue> {
    let req: UniversalEncodeRequest = serde_wasm_bindgen::from_value(request)
        .map_err(|e| JsValue::from_str(&format!("Invalid request: {}", e)))?;

    if req.error_code == 0 || req.error_code > 6 {
        return Err(JsValue::from_str("Invalid error code: must be 1-6"));
    }

    // Bounds checking for data
    if req.data.len() > MAX_BGP_MESSAGE_LEN - MIN_NOTIFICATION_LEN {
        return Err(JsValue::from_str("Data too large for BGP message"));
    }

    let total_len = BGP_HEADER_LEN.checked_add(2)
        .and_then(|n| n.checked_add(req.data.len()))
        .ok_or_else(|| JsValue::from_str("Message too large"))?;

    if total_len > MAX_BGP_MESSAGE_LEN {
        return Err(JsValue::from_str("Message would exceed BGP maximum length"));
    }

    let mut notification = Vec::with_capacity(total_len);
    notification.extend_from_slice(&BGP_MARKER);

    let total_length = total_len as u16;
    notification.push((total_length >> 8) as u8);
    notification.push((total_length & 0xff) as u8);
    notification.push(BGP_NOTIFICATION);
    notification.push(req.error_code);
    notification.push(req.subcode);
    notification.extend_from_slice(&req.data);

    let response = EncodeResponse {
        hex: to_hex(&notification),
        total_bytes: notification.len(),
        message_bytes: req.data.len(),
    };

    serde_wasm_bindgen::to_value(&response)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn decode_universal_notification(hex_input: &str) -> Result<JsValue, JsValue> {
    let clean: String = hex_input.chars()
        .filter(|c| !c.is_whitespace() && *c != ':' && *c != '-')
        .collect();

    let bytes = parse_hex_bounded(&clean, MAX_BGP_MESSAGE_LEN)
        .map_err(|e| JsValue::from_str(&e))?;

    validate_bgp_message(&bytes)
        .map_err(|e| JsValue::from_str(&e))?;

    let error_code = bytes[19];
    let subcode = bytes[20];
    let data_bytes = if bytes.len() > MIN_NOTIFICATION_LEN {
        bytes[21..].to_vec()
    } else {
        vec![]
    };

    let (error_name, subcode_name) = get_error_names(error_code, subcode);
    let interpretation = interpret_data(error_code, subcode, &data_bytes);

    let response = UniversalDecodeResponse {
        error_code,
        error_name,
        subcode,
        subcode_name,
        data_length: data_bytes.len(),
        data_hex: to_hex(&data_bytes),
        interpretation,
    };

    serde_wasm_bindgen::to_value(&response)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

// RFC-compliant data field creator with security hardening
#[wasm_bindgen]
pub fn create_notification_with_data(error_code: u8, subcode: u8, data_type: &str, data_value: &str) -> Result<JsValue, JsValue> {
    if error_code == 0 || error_code > 6 {
        return Err(JsValue::from_str("Invalid error code: must be 1-6"));
    }

    let mut data = Vec::new();

    match (error_code, subcode, data_type) {
        // Message Header Errors
        (1, 2, "length") => {
            let length = parse_u16_bounded(data_value, 0, 65535, "length")
                .map_err(|e| JsValue::from_str(&e))?;
            data.push((length >> 8) as u8);
            data.push((length & 0xff) as u8);
        },
        (1, 3, "type") => {
            let msg_type = parse_u8_bounded(data_value, 0, 255, "message type")
                .map_err(|e| JsValue::from_str(&e))?;
            data.push(msg_type);
        },

        // OPEN Message Errors
        (2, 1, "version") => {
            let version = parse_u16_bounded(data_value, 1, 255, "BGP version")
                .map_err(|e| JsValue::from_str(&e))?;
            data.push((version >> 8) as u8);
            data.push((version & 0xff) as u8);
        },

        // UPDATE Message Errors
        (3, 3, "attribute") => {
            let attr_type = parse_u8_bounded(data_value, 1, 255, "attribute type")
                .map_err(|e| JsValue::from_str(&e))?;
            data.push(attr_type);
        },

        // FSM Errors
        (5, 1, "message_type") | (5, 2, "message_type") | (5, 3, "message_type") => {
            let msg_type = parse_u8_bounded(data_value, 1, 5, "message type")
                .map_err(|e| JsValue::from_str(&e))?;
            data.push(msg_type);
        },

        // Cease with shutdown message
        (6, 2, "message") | (6, 4, "message") => {
            let utf8_bytes = data_value.as_bytes();
            if utf8_bytes.len() > MAX_SHUTDOWN_MSG_LEN {
                return Err(JsValue::from_str(&format!(
                    "Shutdown message too long: {} bytes (max {})", 
                    utf8_bytes.len(), MAX_SHUTDOWN_MSG_LEN
                )));
            }
            data.push(utf8_bytes.len() as u8);
            data.extend_from_slice(utf8_bytes);
        },

        // Raw hex data
        (_, _, "hex") => {
            data = parse_hex_bounded(data_value, MAX_BGP_MESSAGE_LEN - MIN_NOTIFICATION_LEN)
                .map_err(|e| JsValue::from_str(&e))?;
        },

        _ => {
            if !data_value.is_empty() {
                return Err(JsValue::from_str(
                    "This error/subcode combination doesn't support additional data"
                ));
            }
        }
    }

    let request = UniversalEncodeRequest {
        error_code,
        subcode,
        data,
    };

    encode_universal_notification(serde_wasm_bindgen::to_value(&request)?)
}

// Utility functions
#[wasm_bindgen]
pub fn is_hex(input: &str) -> bool {
    let clean: String = input.chars()
        .filter(|c| !c.is_whitespace() && *c != ':' && *c != '-')
        .collect();

    !clean.is_empty() 
        && clean.len() % 2 == 0 
        && clean.len() <= MAX_BGP_MESSAGE_LEN * 2 // Prevent DoS
        && clean.chars().all(|c| c.is_ascii_hexdigit())
}

#[wasm_bindgen]
pub fn get_subcodes() -> JsValue {
    let subcodes = vec![
        (BGP_CEASE_ADMIN_SHUTDOWN, "Administrative Shutdown"),
        (BGP_CEASE_ADMIN_RESET, "Administrative Reset"),
    ];
    serde_wasm_bindgen::to_value(&subcodes).unwrap()
}

// Helper functions (implementation details in next part due to length...)
fn get_error_names(error_code: u8, subcode: u8) -> (String, String) {
    let error_name = match error_code {
        1 => "Message Header Error",
        2 => "OPEN Message Error",
        3 => "UPDATE Message Error", 
        4 => "Hold Timer Expired",
        5 => "Finite State Machine Error",
        6 => "Cease",
        _ => "Unknown Error",
    }.to_string();

    let subcode_name = match (error_code, subcode) {
        (1, 1) => "Connection Not Synchronized",
        (1, 2) => "Bad Message Length",
        (1, 3) => "Bad Message Type",
        (2, 0) => "Unspecific",
        (2, 1) => "Unsupported Version Number",
        (2, 2) => "Bad Peer AS",
        (2, 3) => "Bad BGP Identifier",
        (2, 4) => "Unsupported Optional Parameter",
        (2, 6) => "Unacceptable Hold Time",
        (2, 7) => "Unsupported Capability",
        (3, 0) => "Unspecific",
        (3, 1) => "Malformed Attribute List",
        (3, 2) => "Unrecognized Well-known Attribute",
        (3, 3) => "Missing Well-known Attribute",
        (3, 4) => "Attribute Flags Error",
        (3, 5) => "Attribute Length Error",
        (3, 6) => "Invalid ORIGIN Attribute",
        (3, 8) => "Invalid NEXT_HOP Attribute",
        (3, 9) => "Optional Attribute Error",
        (3, 10) => "Invalid Network Field",
        (3, 11) => "Malformed AS_PATH",
        (4, 0) => "Unspecific",
        (5, 0) => "Unspecified Error",
        (5, 1) => "Receive Unexpected Message in OpenSent State",
        (5, 2) => "Receive Unexpected Message in OpenConfirm State", 
        (5, 3) => "Receive Unexpected Message in Established State",
        (6, 0) => "Unspecific",
        (6, 1) => "Maximum Number of Prefixes Reached",
        (6, 2) => "Administrative Shutdown",
        (6, 3) => "Peer De-configured",
        (6, 4) => "Administrative Reset",
        (6, 5) => "Connection Rejected",
        (6, 6) => "Other Configuration Change",
        (6, 7) => "Connection Collision Resolution",
        (6, 8) => "Out of Resources",
        (6, 9) => "Hard Reset",
        _ => "Unknown Subcode",
    }.to_string();

    (error_name, subcode_name)
}

fn interpret_data(error_code: u8, subcode: u8, data: &[u8]) -> String {
    match (error_code, subcode) {
        (1, 2) if data.len() >= 2 => {
            let bad_length = ((data[0] as u16) << 8) | (data[1] as u16);
            format!("Bad message length: {} (valid range: 19-4096)", bad_length)
        },
        (1, 3) if data.len() >= 1 => {
            let msg_type = match data[0] {
                1 => "OPEN", 2 => "UPDATE", 3 => "NOTIFICATION", 4 => "KEEPALIVE",
                5 => "ROUTE-REFRESH", _ => "Unknown"
            };
            format!("Bad message type: {} ({})", data[0], msg_type)
        },
        (2, 1) if data.len() >= 2 => {
            let version = ((data[0] as u16) << 8) | (data[1] as u16);
            format!("Unsupported BGP version, local supports: {}", version)
        },
        (3, 3) if data.len() >= 1 => {
            let attr_type = data[0];
            let attr_name = match attr_type {
                1 => "ORIGIN", 2 => "AS_PATH", 3 => "NEXT_HOP", _ => "Unknown"
            };
            format!("Missing well-known attribute: {} ({})", attr_type, attr_name)
        },
        (5, 1) | (5, 2) | (5, 3) if data.len() >= 1 => {
            let msg_type = match data[0] {
                1 => "OPEN", 2 => "UPDATE", 3 => "NOTIFICATION", 4 => "KEEPALIVE",
                5 => "ROUTE-REFRESH", _ => "Unknown"
            };
            let state = match subcode {
                1 => "OpenSent", 2 => "OpenConfirm", 3 => "Established", _ => "Unknown"
            };
            format!("Unexpected {} message in {} state", msg_type, state)
        },
        (6, 2) | (6, 4) if !data.is_empty() => {
            if data.len() >= 1 {
                let msg_len = data[0] as usize;
                if data.len() >= 1 + msg_len && msg_len > 0 {
                    match std::str::from_utf8(&data[1..1 + msg_len]) {
                        Ok(msg) => format!("Shutdown message: \"{}\"", msg),
                        Err(_) => "Invalid UTF-8 in shutdown message".to_string(),
                    }
                } else if msg_len == 0 {
                    "Empty shutdown message".to_string()
                } else {
                    "Truncated shutdown message".to_string()
                }
            } else {
                "No shutdown message data".to_string()
            }
        },
        _ => {
            if data.is_empty() {
                "No additional data".to_string()
            } else {
                format!("{} bytes of data", data.len())
            }
        }
    }
}

#[inline]
fn to_hex(bytes: &[u8]) -> String {
    bytes.iter()
        .map(|b| format!("{:02x}", b))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    // Helper function to create test data without WASM dependencies
    fn create_test_notification_bytes(error_code: u8, subcode: u8, data: &[u8]) -> Vec<u8> {
        let total_len = BGP_HEADER_LEN + 2 + data.len();
        let mut message = Vec::with_capacity(total_len);
        
        // BGP marker
        message.extend_from_slice(&BGP_MARKER);
        
        // Length
        let total_length = total_len as u16;
        message.push((total_length >> 8) as u8);
        message.push((total_length & 0xff) as u8);
        
        // Type (notification)
        message.push(BGP_NOTIFICATION);
        
        // Error code and subcode
        message.push(error_code);
        message.push(subcode);
        
        // Data
        message.extend_from_slice(data);
        
        message
    }

    #[test]
    fn test_bgp_validation_functions() {
        // Test valid BGP notification
        let valid_message = create_test_notification_bytes(4, 0, &[]);
        assert!(validate_bgp_message(&valid_message).is_ok());

        // Test message too short
        let short_message = vec![0xff; 10];
        assert!(validate_bgp_message(&short_message).is_err());

        // Test invalid marker
        let mut invalid_marker = create_test_notification_bytes(4, 0, &[]);
        invalid_marker[0] = 0x00;
        assert!(validate_bgp_message(&invalid_marker).is_err());
    }

    #[test]
    fn test_bounds_checking_functions() {
        // Test parse_u8_bounded
        assert!(parse_u8_bounded("5", 1, 10, "test").is_ok());
        assert!(parse_u8_bounded("15", 1, 10, "test").is_err());
        assert!(parse_u8_bounded("abc", 1, 10, "test").is_err());

        // Test parse_u16_bounded
        assert!(parse_u16_bounded("1000", 1, 2000, "test").is_ok());
        assert!(parse_u16_bounded("3000", 1, 2000, "test").is_err());

        // Test parse_hex_bounded
        assert!(parse_hex_bounded("48656c6c6f", 10).is_ok());
        assert!(parse_hex_bounded("48656c6c6f", 3).is_err()); // Too long
        assert!(parse_hex_bounded("xyz", 10).is_err()); // Invalid hex
    }

    #[test]
    fn test_integer_overflow_protection() {
        // Test that large values are handled safely
        assert!(parse_u16_bounded("65535", 0, 65535, "test").is_ok());
        assert!(parse_u16_bounded("65536", 0, 65535, "test").is_err());
        
        // Test hex parsing with large inputs
        let large_hex = "ff".repeat(5000);
        assert!(parse_hex_bounded(&large_hex, 100).is_err());
    }

    #[test]
    fn test_bgp_cease_subcode() {
        assert_eq!(BgpCeaseSubcode::from_u8(2), Some(BgpCeaseSubcode::AdminShutdown));
        assert_eq!(BgpCeaseSubcode::from_u8(4), Some(BgpCeaseSubcode::AdminReset));
        assert_eq!(BgpCeaseSubcode::from_u8(99), None);

        assert_eq!(BgpCeaseSubcode::AdminShutdown.as_str(), "Administrative Shutdown");
        assert_eq!(BgpCeaseSubcode::AdminReset.as_str(), "Administrative Reset");
    }

    #[test]
    fn test_helper_functions() {
        // Test to_hex function
        let bytes = vec![0xff, 0x00, 0xab];
        assert_eq!(to_hex(&bytes), "ff 00 ab");

        // Test get_error_names
        let (error_name, subcode_name) = get_error_names(4, 0);
        assert_eq!(error_name, "Hold Timer Expired");
        assert_eq!(subcode_name, "Unspecific");

        // Test interpret_data
        let interpretation = interpret_data(1, 2, &[0x00, 0x10]); // Bad length
        assert!(interpretation.contains("Bad message length: 16"));
    }

    #[test]
    fn test_is_hex_function() {
        assert!(is_hex("48656c6c6f"));
        assert!(is_hex("48 65 6c 6c 6f"));
        assert!(is_hex("48:65:6c:6c:6f"));
        assert!(!is_hex("xyz"));
        assert!(!is_hex("48656c6c6")); // Odd length
        assert!(!is_hex("")); // Empty
    }

    // WASM-specific tests - only run when targeting WASM
    #[cfg(target_arch = "wasm32")]
    mod wasm_tests {
        use super::*;
        use wasm_bindgen_test::*;

        #[wasm_bindgen_test]
        fn test_mikrotik_format_corrected() {
            let result = decode_universal_notification("ffffffffffffffffffffffffffffffff0015030400");
            assert!(result.is_ok());

            let decoded: UniversalDecodeResponse = serde_wasm_bindgen::from_value(result.unwrap()).unwrap();
            assert_eq!(decoded.error_code, 4); // Hold Timer Expired
            assert_eq!(decoded.subcode, 0);    // Unspecific
        }

        #[wasm_bindgen_test]
        fn test_encode_decode_round_trip() {
            let req = EncodeRequest {
                message: "Test shutdown".to_string(),
                subcode: 2,
            };
            
            let encoded = encode_shutdown_message(serde_wasm_bindgen::to_value(&req).unwrap()).unwrap();
            let response: EncodeResponse = serde_wasm_bindgen::from_value(encoded).unwrap();
            
            let decoded = decode_shutdown_message(&response.hex).unwrap();
            let decoded_response: DecodeResponse = serde_wasm_bindgen::from_value(decoded).unwrap();
            
            assert_eq!(decoded_response.message, "Test shutdown");
            assert_eq!(decoded_response.subcode_value, 2);
        }

        #[wasm_bindgen_test]
        fn test_bounds_checking_wasm() {
            // Test message too long
            let long_data = vec![0u8; 5000];
            let req = UniversalEncodeRequest {
                error_code: 1,
                subcode: 1,
                data: long_data,
            };
            let result = encode_universal_notification(serde_wasm_bindgen::to_value(&req).unwrap());
            assert!(result.is_err());
        }

        #[wasm_bindgen_test]
        fn test_create_notification_with_data_wasm() {
            let result = create_notification_with_data(1, 2, "length", "999999");
            assert!(result.is_ok());
            
            let result = create_notification_with_data(1, 2, "length", "99999");
            assert!(result.is_ok());
        }
    }
}
