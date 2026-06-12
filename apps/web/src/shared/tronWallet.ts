/** 对齐 bundle `Zje.utils.accounts.generateAccount()`（按需加载，避免主包膨胀） */
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRONGRID_HOST = "https://api.trongrid.io";

export interface TronWalletKeypair {
  address: string;
  key: string;
}

async function loadTronWeb() {
  return import("tronweb");
}

export async function generateTronWallet(): Promise<TronWalletKeypair> {
  const { utils } = await loadTronWeb();
  const account = utils.accounts.generateAccount();
  return {
    address: account.address.base58,
    key: account.privateKey,
  };
}

/** 查询链上 TRX / USDT 余额（TronGrid 公共节点） */
export async function fetchTronBalances(address: string): Promise<{ trx: number; usdt: number }> {
  const { TronWeb } = await loadTronWeb();
  const tronWeb = new TronWeb({ fullHost: TRONGRID_HOST });
  const trxSun = await tronWeb.trx.getBalance(address);
  const trx = Number(TronWeb.fromSun(trxSun));

  const contract = await tronWeb.contract().at(USDT_CONTRACT);
  const usdtRaw = await contract.balanceOf(address).call();
  const usdt = Number(usdtRaw) / 1_000_000;

  return { trx, usdt };
}
