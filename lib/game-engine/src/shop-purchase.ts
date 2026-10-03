export const MAX_SHOP_PURCHASE_QUANTITY = 100;
export function shopPurchaseQuantity(value:unknown):number {
  const quantity=value===undefined?1:value;
  if(typeof quantity!=='number' || !Number.isSafeInteger(quantity) || quantity<1 || quantity>MAX_SHOP_PURCHASE_QUANTITY) throw new RangeError(`구매 수량은 1~${MAX_SHOP_PURCHASE_QUANTITY} 사이의 정수여야 합니다.`);
  return quantity;
}
export function shopPurchaseTotals(price:number,packsPerListing:number,quantity:number) {
  shopPurchaseQuantity(quantity);
  const total=price*quantity,packQuantity=packsPerListing*quantity;
  if(!Number.isSafeInteger(total)||total<0||total>2147483647||!Number.isSafeInteger(packQuantity)||packQuantity<1||packQuantity>2147483647) throw new RangeError('구매 금액 또는 팩 수량이 허용 범위를 초과했습니다.');
  return {total,packQuantity};
}
