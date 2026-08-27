
import requests

url = "http://localhost:5000/photo-restore"
files = {'image': ('test.jpg', b'fake image content', 'image/jpeg')}
data = {'enable_watermark': 'false'}

try:
    print(f"Testing POST {url}...")
    response = requests.post(url, files=files, data=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text[:200]}")
except Exception as e:
    print(f"Error: {e}")
