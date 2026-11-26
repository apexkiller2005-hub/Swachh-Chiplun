"""Shared AI text helpers (languages + safe fallback replies).

The AI calls themselves go through lib/gemini.py (Google Gemini, free tier).
"""

LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi, written in Devanagari script",
    "mr": "Marathi, written in Devanagari script",
}

# Canned safe answers if the model call fails outright — per language.
FALLBACK_REPLIES = {
    "en": "Sorry, I could not reach the AI service just now. General rule: keep the item dry, "
          "segregate it from kitchen waste, and hand it over at your nearest collection centre. "
          "For electronics, use only an authorised e-waste recycler; never burn or dump waste in the open.",
    "hi": "क्षमा करें, अभी AI सेवा से संपर्क नहीं हो पा रहा। सामान्य नियम: वस्तु को सूखा रखें, रसोई के कचरे से अलग रखें "
          "और निकटतम संग्रहण केंद्र में जमा करें। इलेक्ट्रॉनिक्स के लिए केवल अधिकृत ई-वेस्ट रीसाइक्लर का उपयोग करें; "
          "कचरा कभी जलाएं या खुले में न फेंकें।",
    "mr": "क्षमस्व, सध्या AI सेवेशी संपर्क होऊ शकत नाही. सामान्य नियम: वस्तू कोरडी ठेवा, स्वयंपाकघराच्या कचऱ्यापासून वेगळी ठेवा "
          "आणि जवळच्या संकलन केंद्रात जमा करा. इलेक्ट्रॉनिक्ससाठी फक्त अधिकृत ई-वेस्ट रीसायक्लर वापरा; कचरा कधीही जाळू नका "
          "किंवा उघड्यावर टाकू नका.",
}
