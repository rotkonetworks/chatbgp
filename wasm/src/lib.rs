use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

// BGP Constants
const BGP_MARKER: [u8; 16] = [0xff; 16];
const BGP_HEADER_LEN: usize = 19;
const BGP_NOTIFICATION: u8 = 3;
const BGP_ERROR_CEASE: u8 = 6;
const BGP_CEASE_ADMIN_SHUTDOWN: u8 = 2;
const BGP_CEASE_ADMIN_RESET: u8 = 4;
const MAX_SHUTDOWN_MSG_LEN: usize = 255;
const MIN_NOTIFICATION_LEN: usize = 22;

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

/// Encode shutdown message to RFC 9003 compliant BGP notification
#[wasm_bindgen]
pub fn encode_shutdown_message(request: JsValue) -> Result<JsValue, JsValue> {
    let req: EncodeRequest = serde_wasm_bindgen::from_value(request)
        .map_err(|e| JsValue::from_str(&format!("Invalid request: {}", e)))?;
    
    // Validate subcode
    let _subcode = BgpCeaseSubcode::from_u8(req.subcode)
        .ok_or_else(|| JsValue::from_str("Invalid subcode: must be 2 or 4"))?;
    
    // Validate UTF-8 and length
    let utf8_bytes = req.message.as_bytes();
    if utf8_bytes.len() > MAX_SHUTDOWN_MSG_LEN {
        return Err(JsValue::from_str(&format!(
            "Message exceeds 255 bytes (got {} bytes)", 
            utf8_bytes.len()
        )));
    }
    
    // Build BGP notification
    let mut message = Vec::with_capacity(BGP_HEADER_LEN + 3 + utf8_bytes.len());
    
    // BGP Header
    message.extend_from_slice(&BGP_MARKER);
    
    // Total length (big-endian)
    let total_length = (BGP_HEADER_LEN + 3 + utf8_bytes.len()) as u16;
    message.push((total_length >> 8) as u8);
    message.push((total_length & 0xff) as u8);
    
    // Message type
    message.push(BGP_NOTIFICATION);
    
    // Notification body
    message.push(BGP_ERROR_CEASE);
    message.push(req.subcode);
    message.push(utf8_bytes.len() as u8);
    message.extend_from_slice(utf8_bytes);
    
    // Convert to hex
    let hex = to_hex(&message);
    
    let response = EncodeResponse {
        hex,
        total_bytes: message.len(),
        message_bytes: utf8_bytes.len(),
    };
    
    serde_wasm_bindgen::to_value(&response)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Decode BGP notification from hex
#[wasm_bindgen]
pub fn decode_shutdown_message(hex_input: &str) -> Result<JsValue, JsValue> {
    // Parse hex
    let bytes = from_hex(hex_input)
        .map_err(|e| JsValue::from_str(&e))?;
    
    // Validate minimum length
    if bytes.len() < MIN_NOTIFICATION_LEN {
        return Err(JsValue::from_str(&format!(
            "Message too short (minimum {} bytes, got {})", 
            MIN_NOTIFICATION_LEN, 
            bytes.len()
        )));
    }
    
    // Verify marker
    if !bytes[..16].iter().all(|&b| b == 0xff) {
        return Err(JsValue::from_str("Invalid BGP marker"));
    }
    
    // Parse header
    let _msg_length = ((bytes[16] as u16) << 8) | (bytes[17] as u16);
    let msg_type = bytes[18];
    
    if msg_type != BGP_NOTIFICATION {
        return Err(JsValue::from_str(&format!(
            "Not a notification message (type={})", 
            msg_type
        )));
    }
    
    // Parse notification
    let error_code = bytes[19];
    if error_code != BGP_ERROR_CEASE {
        return Err(JsValue::from_str(&format!(
            "Not a Cease error (code={})", 
            error_code
        )));
    }
    
    let subcode = bytes[20];
    let subcode_enum = BgpCeaseSubcode::from_u8(subcode)
        .ok_or_else(|| JsValue::from_str(&format!("Unknown subcode: {}", subcode)))?;
    
    // Parse shutdown communication
    let text_length = bytes[21] as usize;
    
    let message = if text_length == 0 {
        String::new()
    } else {
        if bytes.len() < MIN_NOTIFICATION_LEN + text_length {
            return Err(JsValue::from_str("Message truncated"));
        }
        
        // Extract and decode UTF-8
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

/// Check if input is valid hex
#[wasm_bindgen]
pub fn is_hex(input: &str) -> bool {
    let clean = input.replace(' ', "");
    !clean.is_empty() && 
    clean.len() % 2 == 0 && 
    clean.chars().all(|c| c.is_ascii_hexdigit())
}

/// Get available subcodes for dropdown
#[wasm_bindgen]
pub fn get_subcodes() -> JsValue {
    let subcodes = vec![
        (BGP_CEASE_ADMIN_SHUTDOWN, "Administrative Shutdown"),
        (BGP_CEASE_ADMIN_RESET, "Administrative Reset"),
    ];
    
    serde_wasm_bindgen::to_value(&subcodes).unwrap()
}

// Helper functions

#[inline]
fn to_hex(bytes: &[u8]) -> String {
    bytes.iter()
        .map(|b| format!("{:02x}", b))
        .collect::<Vec<_>>()
        .join(" ")
}

fn from_hex(hex: &str) -> Result<Vec<u8>, String> {
    let clean: String = hex.chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    
    if clean.is_empty() {
        return Err("Empty hex string".to_string());
    }
    
    if clean.len() % 2 != 0 {
        return Err("Hex string must have even number of characters".to_string());
    }
    
    let mut bytes = Vec::with_capacity(clean.len() / 2);
    
    for i in (0..clean.len()).step_by(2) {
        let byte_str = &clean[i..i + 2];
        let byte = u8::from_str_radix(byte_str, 16)
            .map_err(|_| format!("Invalid hex characters at position {}", i))?;
        bytes.push(byte);
    }
    
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_roundtrip() {
        let req = EncodeRequest {
            message: "Test maintenance window".to_string(),
            subcode: BGP_CEASE_ADMIN_SHUTDOWN,
        };
        
        let encoded = encode_shutdown_message(serde_wasm_bindgen::to_value(&req).unwrap()).unwrap();
        let enc_resp: EncodeResponse = serde_wasm_bindgen::from_value(encoded).unwrap();
        
        let decoded = decode_shutdown_message(&enc_resp.hex).unwrap();
        let dec_resp: DecodeResponse = serde_wasm_bindgen::from_value(decoded).unwrap();
        
        assert_eq!(dec_resp.message, "Test maintenance window");
        assert_eq!(dec_resp.subcode_value, BGP_CEASE_ADMIN_SHUTDOWN);
    }
    
    #[test]
    fn test_max_length_validation() {
        let req = EncodeRequest {
            message: "A".repeat(256),
            subcode: BGP_CEASE_ADMIN_SHUTDOWN,
        };
        
        let result = encode_shutdown_message(serde_wasm_bindgen::to_value(&req).unwrap());
        assert!(result.is_err());
    }
    
    #[test]
    fn test_empty_message() {
        let req = EncodeRequest {
            message: String::new(),
            subcode: BGP_CEASE_ADMIN_RESET,
        };
        
        let encoded = encode_shutdown_message(serde_wasm_bindgen::to_value(&req).unwrap()).unwrap();
        let enc_resp: EncodeResponse = serde_wasm_bindgen::from_value(encoded).unwrap();
        
        assert_eq!(enc_resp.message_bytes, 0);
        assert_eq!(enc_resp.total_bytes, 22);
    }
}
