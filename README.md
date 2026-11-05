# dsh-tlpro-models

Khai báo gateway **TLPro** và catalog model của nó cho DeepSeek Harness.

Đây là một **bundle patch layer** — đúng cơ chế composition DSH dùng cho profile:
loader áp các lớp trong `dsh.profile.bundles` theo thứ tự, rồi tới
`cordis.patch.yml` của profile, **ghi đè theo row id, lớp sau thắng**.

Package này không có code, chỉ có cấu hình. Nó **không sửa repo/checkout DSH**,
không patch file nào trong `node_modules`, không require plugin nào. Gỡ package
khỏi profile là mọi route nó thêm biến mất.

## Nó khai báo gì

Một route `tlpro`:

| Trường | Giá trị |
|---|---|
| `api` | `openai-completions` |
| `baseURL` | `https://hoantienmuasam.net/llmtlpro/v1` |
| `apiKeyEnv` | `TLPRO_API_KEY` (credential reference, không phải secret) |

Catalog hiện có 3 model, khớp đúng `/v1/models` của gateway:

| Model | Context | Max output | Reasoning |
|---|---|---|---|
| `deepseek-v4.1-flash` | 1,000,000 | 393,216 | low / high / max |
| `glm-5.3-flash` | 1,000,000 | 131,072 | low / high / max |
| `glm-5.3` | 1,000,000 | 131,072 | low / high / max |

## Cài vào một profile

Có hai cách, tuỳ bạn muốn dùng bản sao cục bộ hay kéo thẳng từ GitHub.

**Từ GitHub** (khuyến nghị khi dùng trên máy khác):

```json
{
  "dependencies": {
    "dsh-tlpro-models": "github:dungcsnd1133/dsh-tlpro-models"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-tlpro-models"
      ]
    }
  }
}
```

**Từ thư mục cục bộ** (khi đang sửa catalog):

```json
"dependencies": { "dsh-tlpro-models": "link:/data/dsh-plugins/dsh-tlpro-models" }
```

Thứ tự quan trọng: bundle này phải đứng **sau** `@deepseek-ai/dsh-base`, vì
`dsh-base` là lớp mount row `llm-pi-ai`; lớp sau ghi đè `config` của row đó.

Rồi cài dependency:

```bash
dsh plugin --profile <tên-profile> install
```

Kiểm tra lớp đã áp:

```bash
dsh <tên-profile> --dump-config | grep 'patched by dsh-tlpro-models'
```


## Cập nhật catalog khi gateway thêm model

Sửa danh sách `models:` trong `cordis.patch.yml`, restart profile. Không cần
publish, không cần đụng DSH.

Muốn tự lấy danh sách mới nhất từ gateway:

```bash
curl -s -H "Authorization: Bearer $TLPRO_API_KEY" \
  https://hoantienmuasam.net/llmtlpro/v1/models | jq -r '.data[].id'
```

## Ghi chú

- Patch **thay thế toàn bộ `config`** của row, không merge. Nếu profile khác
  cũng khai báo `llm-pi-ai` thì lớp đứng sau thắng toàn bộ — đừng khai báo nửa vời.
- `apiKeyEnv` là *tên biến*, không phải key. Secret vẫn nằm trong env container
  (`/proc/1/environ`) hoặc credential store, không vào file cấu hình.
- Catalog ở đây chỉ khai báo những model gateway thực sự trả về. Khai báo model
  không tồn tại sẽ lỗi lúc gọi, không lỗi lúc boot.

## Nguồn của các con số (đã kiểm chứng 2026-11-05)

Bảng capability gốc nằm trong `9router@0.5.112`:
`app/.next-cli-build/server/chunks/24.js`. Trường `thinkingFormat` quyết định
router gửi tham số nào lên upstream — và đó là thứ các mức trong đây phải khớp.

| Model | thinkingFormat | Router làm gì với mức |
|---|---|---|
| `glm-5.3` | `openai` | gửi `reasoning_effort` nguyên văn |
| `glm-5.3-flash` | `openai` | gửi `reasoning_effort` nguyên văn |
| `deepseek-v4.1-flash` | `deepseek` | **remap**: `xhigh\|max`→`max`, `low\|minimal`→`low`, còn lại→`high` |

Nhánh `zai` (nhánh gộp mức thành low/high/max) **không áp dụng** cho ba model
này — nhánh đó chỉ chạy khi `thinkingFormat` là `zai`. Đã đối chiếu
`chunks/2380.js`: `case"zai"` và `case"openai"` là hai nhánh riêng.

### Vì sao probe `max_tokens` trước đây không có giá trị

Router **âm thầm hạ** giá trị vượt trần trước khi gửi upstream:

```js
if (a.max_tokens) { let b = s.maxOutput || l.Uc; a.max_tokens > b && (a.max_tokens = b) ... }
```

Nên gửi `max_tokens: 800000` rồi nhận một câu trả lời ngắn **không** chứng minh
được điều gì: request đã bị cắt về `maxOutput` trước khi rời router. Trần thật
phải đọc từ bảng capability, không phải từ việc gateway "nhận" request.

Ranh giới đo được: `glm-5.3` nhận 131072 và **từ chối 131073** → trần đúng là
131072, không phải 128000.

### `thinkingEffortSupported: false` ở glm-5.3-flash

Bảng capability đánh dấu cờ này `false` cho bản flash ở một số provider. Nghĩa
là mức gửi lên vẫn được chấp nhận nhưng **không chắc tạo khác biệt thực sự**.
Vì vậy đừng kỳ vọng số reasoning token thay đổi theo mức ở model này.

### Không thêm `xhigh`

`xhigh` chưa được xác minh là từng nguồn hỗ trợ hay quy đổi thế nào. Với GLM bộ
mức đang được xử lý rõ ràng là `low/high/max`. Thêm `xhigh` lúc này chỉ tạo một
lựa chọn trong UI mà không có bằng chứng nó có tác dụng.

### Giới hạn chung của TLPRO (không phải token)

- Body văn bản: 4.000.000 byte; có ảnh: 20.000.000 byte
- Timeout upstream văn bản: 600 giây (proxy có thể ngắt sớm hơn)
- `/v1/models` chỉ trả id, **không** trả context/output → plugin không tự đọc được
