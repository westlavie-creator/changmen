import { useUserStore } from "@/stores/userStore";

/** [changmen 扩展] 是否发送套利机会 Telegram（与 notifyArbProgress 独立） */
export function shouldSendArbOpportunity(): boolean {
  const user = useUserStore();
  if (!user.message?.telegramId?.trim()) return false;
  return user.message.notifyArbOpportunity === true;
}
