/**
 * Node half của dsh-tlpro-models.
 *
 * Toàn bộ tính năng nằm ở tầng cấu hình: `cordis.patch.yml` khai báo route
 * TLPro + Z.ai vào row `llm-pi-ai`, và DSH áp patch này khi nạp profile. Module
 * này tồn tại chỉ vì một row Cordis cần thứ gì đó để import — một `apply` rỗng
 * là thứ nhỏ nhất mount sạch.
 *
 * Không có nó, plugin manager không có entry nào để kích hoạt và báo
 * "verification failed" dù patch vẫn đang phát huy tác dụng — gây hiểu nhầm
 * rằng model route hỏng.
 */
export const name = 'dsh-tlpro-models'
export const inject = []
export function apply() {}
