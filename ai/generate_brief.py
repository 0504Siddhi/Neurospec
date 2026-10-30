#!/usr/bin/env python3
"""
ai/generate_brief.py - AI Executive Brief Generator for NeuroSpec

Generates localized executive program briefs (English, Hindi, Marathi)
evaluating pre-screening hardware trade-offs for health program directors.

Security & Integrity Constraints:
- BRIEF_API_KEY is read strictly from environment variables (never hardcoded).
- Prompt specifies: use ONLY the supplied numbers, no medical claims, no diagnosis language.
- Output numbers are strictly validated against input numbers. Unauthorized numbers trigger a retry;
  if retry fails or if no API key is provided, validated template-based briefs are generated.
- Writes output to ai/briefs.json.
"""

import os
import sys
import json
import re
import argparse
from pathlib import Path
import urllib.request
import urllib.error

OUTPUT_FILE = Path(__file__).parent / "briefs.json"


def parse_args():
    parser = argparse.ArgumentParser(description="Generate localized program briefs from EEG hardware metrics.")
    parser.add_argument("--channels", type=int, default=8, help="Number of channels")
    parser.add_argument("--rate", type=int, default=500, help="Sampling rate in Hz")
    parser.add_argument("--cost", type=int, default=9588, help="Unit hardware cost in INR")
    parser.add_argument("--sensitivity", type=float, default=77.8, help="Screening sensitivity percentage")
    parser.add_argument("--sensitivity_std", type=float, default=3.4, help="Sensitivity standard deviation")
    parser.add_argument("--referrals", type=float, default=29.7, help="Extra referrals per 100 healthy")
    parser.add_argument("--referrals_std", type=float, default=7.4, help="Extra referrals standard deviation")
    parser.add_argument("--seniors", type=int, default=1000, help="Seniors screened in camp")
    parser.add_argument("--prevalence", type=float, default=7.4, help="Assumed dementia prevalence percentage")
    parser.add_argument("--headsets", type=int, default=100, help="Deployed headset units")
    return parser.parse_args()


def calculate_derived_metrics(args):
    seniors = args.seniors
    p = args.prevalence / 100.0
    total_dementia = seniors * p
    total_healthy = seniors * (1.0 - p)

    cases_caught = int(round(total_dementia * (args.sensitivity / 100.0)))
    healthy_referred = int(round(total_healthy * (args.referrals / 100.0)))
    total_referrals = cases_caught + healthy_referred
    total_hardware_cost = int(args.headsets * args.cost)
    cost_per_case = int(round(total_hardware_cost / max(cases_caught, 1)))
    referrals_per_case = round(total_referrals / max(cases_caught, 1), 1)

    return {
        "channels": args.channels,
        "sampling_rate_hz": args.rate,
        "cost_inr": args.cost,
        "sensitivity_pct": args.sensitivity,
        "sensitivity_std": args.sensitivity_std,
        "extra_referrals_per_100": args.referrals,
        "extra_referrals_std": args.referrals_std,
        "camp_seniors": seniors,
        "camp_prevalence_pct": args.prevalence,
        "camp_headsets": args.headsets,
        "cases_caught": cases_caught,
        "healthy_referred": healthy_referred,
        "total_referrals": total_referrals,
        "total_hardware_cost_inr": total_hardware_cost,
        "cost_per_case_inr": cost_per_case,
        "referrals_per_true_case": referrals_per_case,
    }


def get_allowed_number_tokens(metrics):
    allowed = set()
    for val in metrics.values():
        if isinstance(val, (int, float)):
            allowed.add(str(val))
            if isinstance(val, float):
                allowed.add(f"{val:.1f}")
                if val.is_integer():
                    allowed.add(str(int(val)))
            elif isinstance(val, int):
                allowed.add(f"{float(val):.1f}")
    # Common universal tokens needed for grammatical ratios / scaling
    allowed.update({"1", "10", "100", "19", "0"})
    return allowed


def validate_text_numbers(text, allowed_tokens):
    # Extract all standalone integers or decimals
    found_numbers = re.findall(r"\b\d+(?:\.\d+)?\b", text)
    unauthorized = []
    for num in found_numbers:
        # Check direct or float-equal match
        if num in allowed_tokens:
            continue
        try:
            val = float(num)
            if any(abs(val - float(token)) < 1e-4 for token in allowed_tokens if re.match(r"^\d+(?:\.\d+)?$", token)):
                continue
        except ValueError:
            pass
        unauthorized.append(num)
    return unauthorized


def build_template_briefs(m):
    return {
        "en": {
            "title": f"Executive Brief: {m['channels']}-Channel EEG Pre-Screening Hardware",
            "summary": (
                f"Evaluation for community health screening: The recommended {m['channels']}-channel configuration "
                f"operating at {m['sampling_rate_hz']} Hz costs ₹{m['cost_inr']} per unit (chip and electrodes only). "
                f"In empirical testing, it achieved {m['sensitivity_pct']}% sensitivity (±{m['sensitivity_std']}% SD) "
                f"with {m['extra_referrals_per_100']} extra referrals per 100 healthy individuals (±{m['extra_referrals_std']} SD)."
            ),
            "logistics": (
                f"In a simulated field camp of {m['camp_seniors']} seniors ({m['camp_prevalence_pct']}% assumed prevalence, "
                f"{m['camp_headsets']} headsets), this hardware catches approximately {m['cases_caught']} true cases "
                f"while referring {m['healthy_referred']} healthy seniors to secondary clinics. "
                f"Capital hardware cost per true case identified is ₹{m['cost_per_case_inr']}, "
                f"with {m['referrals_per_true_case']} total clinic referrals per true case caught."
            ),
            "clinical_boundaries": (
                "Screening logistics and hardware budgeting support only. Not a diagnostic device. "
                "Does not provide clinical confirmation or replace physician evaluation. "
                "Recorded using wet electrodes in hospital settings; field dry sensors will exhibit higher contact noise."
            )
        },
        "hi": {
            "title": f"कार्यकारी सारांश: {m['channels']}-चैनल ईईजी पूर्व-स्क्रीनिंग हार्डवेयर",
            "summary": (
                f"सामुदायिक स्वास्थ्य पूर्व-स्क्रीनिंग मूल्यांकन: अनुशंसित {m['channels']}-चैनल कॉन्फ़िगरेशन "
                f"({m['sampling_rate_hz']} हर्ट्ज़) की प्रति यूनिट हार्डवेयर लागत ₹{m['cost_inr']} है (केवल चिप और इलेक्ट्रोड)। "
                f"परीक्षण में इसने {m['sensitivity_pct']}% संवेदनशीलता (±{m['sensitivity_std']}% SD) "
                f"तथा {m['extra_referrals_per_100']} अतिरिक्त रेफरल प्रति 100 स्वस्थ व्यक्ति (±{m['extra_referrals_std']} SD) प्राप्त किए।"
            ),
            "logistics": (
                f"{m['camp_seniors']} वरिष्ठ नागरिकों के शिविर में ({m['camp_prevalence_pct']}% प्रसार अनुमान, "
                f"{m['camp_headsets']} हेडसेट), यह प्रणाली लगभग {m['cases_caught']} वास्तविक मामलों की पहचान करती है "
                f"और {m['healthy_referred']} स्वस्थ व्यक्तियों को द्वितीयक क्लीनिक में रेफर करती है। "
                f"पहचाने गए प्रति वास्तविक मामले पर हार्डवेयर लागत ₹{m['cost_per_case_inr']} है, "
                f"तथा प्रति वास्तविक मामले पर कुल {m['referrals_per_true_case']} क्लिनिकल रेफरल होते हैं।"
            ),
            "clinical_boundaries": (
                "केवल पूर्व-स्क्रीनिंग लॉजिस्टिक्स और उपकरण बजट योजना सहायता हेतु। यह कोई चिकित्सीय निदान (डायग्नोसिस) नहीं है। "
                "यह डॉक्टर के व्यापक परीक्षण का विकल्प नहीं है। अस्पताल में वेट इलेक्ट्रोड द्वारा मूल्यांकित; फील्ड में ड्राई सेंसर में शोर अधिक होगा।"
            )
        },
        "mr": {
            "title": f"कार्यकारी अहवाल: {m['channels']}-चॅनेल ईईजी पूर्व-स्क्रीनिंग हार्डवेअर",
            "summary": (
                f"समुदाय आरोग्य पूर्व-स्क्रीनिंग मूल्यमापन: शिफारस केलेले {m['channels']}-चॅनेल कॉन्फिगरेशन "
                f"({m['sampling_rate_hz']} हर्ट्झ) प्रति युनिट ₹{m['cost_inr']} खर्चात उपलब्ध आहे (फक्त चिप आणि इलेक्ट्रोड्स). "
                f"चाचणीत याने {m['sensitivity_pct']}% संवेदनशीलता (±{m['sensitivity_std']}% SD) "
                f"आणि {m['extra_referrals_per_100']} अतिरिक्त रेफरल्स प्रति 100 निरोगी व्यक्ती (±{m['extra_referrals_std']} SD) नोंदवले."
            ),
            "logistics": (
                f"{m['camp_seniors']} ज्येष्ठ नागरिकांच्या शिबिरात ({m['camp_prevalence_pct']}% गृहीत प्रमाण, "
                f"{m['camp_headsets']} हेडसेट), ही यंत्रणा अंदाजे {m['cases_caught']} प्रत्यक्ष व्यक्ती शोधते "
                f"आणि {m['healthy_referred']} निरोगी व्यक्तींना पुढील क्लिनिक तपासणीसाठी रेफर करते. "
                f"प्रति प्रत्यक्ष शोधलेल्या प्रकरणासाठी हार्डवेअर खर्च ₹{m['cost_per_case_inr']} असून, "
                f"प्रति प्रत्यक्ष प्रकरणासाठी एकूण {m['referrals_per_true_case']} क्लिनिकल रेफरल्स होतात."
            ),
            "clinical_boundaries": (
                "फक्त पूर्व-स्क्रीनिंग नियोजन आणि उपकरणांच्या बजेटसाठी सहाय्यक. हे कोणतेही वैद्यकीय निदान (diagnosis) नाही. "
                "हे तज्ज्ञ डॉक्टरांच्या तपासणीचा पर्याय नाही. ओल्या इलेक्ट्रोड्सवर आधारित; ग्रामीण भागात ड्राय सेन्सर्स अधिक आवाजी (noise) असू शकतात."
            )
        }
    }


def call_llm(prompt, api_key):
    # Support OpenAI or Gemini endpoint depending on key format
    if api_key.startswith("AIza"):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"}
        }
        headers = {"Content-Type": "application/json"}
    else:
        url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1") + "/chat/completions"
        payload = {
            "model": os.environ.get("BRIEF_MODEL", "gpt-4o-mini"),
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }

    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read().decode("utf-8"))

    if "candidates" in body:
        raw_text = body["candidates"][0]["content"]["parts"][0]["text"]
    else:
        raw_text = body["choices"][0]["message"]["content"]

    return json.loads(raw_text)


def generate_with_llm(metrics, allowed_tokens, api_key):
    base_prompt = (
        "You are an AI assistant generating executive program briefs for cognitive healthcare directors.\n"
        "STRICT MANDATE:\n"
        "1. You must use ONLY the supplied numbers below. Do NOT invent, round, extrapolate, or introduce ANY unauthorized number.\n"
        "2. NO medical claims. NO diagnosis language. This is purely a pre-screening triage logistics and procurement tool.\n"
        "3. Return strict JSON with top-level keys 'en', 'hi', 'mr'. Each must have 'title', 'summary', 'logistics', 'clinical_boundaries'.\n\n"
        f"SUPPLIED METRICS:\n{json.dumps(metrics, indent=2)}\n"
    )

    for attempt in range(2):
        try:
            print(f"Calling LLM for brief generation (attempt {attempt + 1})...")
            briefs = call_llm(base_prompt, api_key)
            
            # Validate output numbers
            all_text = json.dumps(briefs, ensure_ascii=False)
            unauthorized = validate_text_numbers(all_text, allowed_tokens)
            if not unauthorized:
                print("LLM brief successfully generated and validated against supplied numbers.")
                return briefs, "llm"
            else:
                print(f"Validation failed (attempt {attempt + 1}): unauthorized numbers detected: {unauthorized}")
                base_prompt += f"\nERROR: Your previous output contained unauthorized numbers {unauthorized}. Output ONLY the supplied numbers!"
        except Exception as e:
            print(f"LLM call failed (attempt {attempt + 1}): {e}")

    print("Falling back to verified template briefs.")
    return build_template_briefs(metrics), "template_fallback"


def main():
    args = parse_args()
    metrics = calculate_derived_metrics(args)
    allowed_tokens = get_allowed_number_tokens(metrics)

    api_key = os.environ.get("BRIEF_API_KEY", "").strip()

    if api_key:
        briefs, source = generate_with_llm(metrics, allowed_tokens, api_key)
    else:
        print("BRIEF_API_KEY not set. Generating verified template-based briefs.")
        briefs = build_template_briefs(metrics)
        source = "template"

    output_payload = {
        "status": "success",
        "source": source,
        "selected_config": metrics,
        "briefs": briefs
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, indent=2, ensure_ascii=False)

    print(f"Briefs written to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
