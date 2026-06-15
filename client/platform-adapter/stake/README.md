# Stake ƽ̨������

GraphQL �µ� / ��� / ���� + ��� GraphQL �ɼ� + A8 Socket ����Ƶ����

## Ŀ¼

| ·�� | ˵�� |
|------|------|
| `frontend/bet.ts` | Provider��`getBalance` / `checkBet` / `betting` / `getOrders` |
| `frontend/collect.ts` | ������ɼ������ GraphQL + WS�� |
| `frontend/pluginApi.ts` | �� Chrome ��չ�� stake.com ��ǩҳ�� GraphQL |
| `frontend/tabId.ts` | ��ȡ��չ�󶨵� Stake tabId |
| `node/` | **Node CLI** ���Խű����� session/Feed���ɼ����� `frontend/`�� |

## ����ǰ��

1. ��װ `changmen/client/chrome-extension` ��չ����¼ GameBet ����̨��
2. ������� [stake.com](https://stake.com) ����ɵ�¼����չд�� `tabId`��
3. �û����������� Stake �ɼ����˺����� `token`��x-access-token���� `gateway`��
4. ǰ�� `HomeView` ����� `primeStakeTabId()` Ԥȡ tabId��

## �µ�·�������� A8 `eu` Provider��

```
accountStore.betting()
  �� stakeProvider.checkBet()   // SportMarketOutcome + �����޺� + 30s ͬ�̿ڽ���
  �� stakeProvider.betting()    // sportBet mutation���� a8PluginPost + tabId
```

����ʧ�ܣ�

| ��Ϣ | ԭ�� |
|------|------|
| `δ�ҵ� Stake ��ǩҳ��` | δ�� stake.com ����չδ�� tab |
| `���Ե� 30 ��������¡�` | ͬ `betId` ���� |
| `�����޺죺��` | `oddsStore` �޺컺�� |
| `rejectedBetLimitExceededForBetReoffer` | �����޺죬��д�뱾���޺� |

## ��Ԫ����

```bash
cd changmen/client/web
npm test -- client/platform-adapter/stake/frontend
```

���ǣ�����״̬ӳ�䡢USDT��CNY ���㡢tabId �������޺��жϡ�

## manifest

`registry/manifest.json`��`bet: true`��`pluginOnly: true`��`implementation: "done"`��
