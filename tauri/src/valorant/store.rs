use super::*;

const VP: &str = "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741";
const KC: &str = "85ca954a-41f2-ce94-9b45-8ca3dd39a00d";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Storefront {
    bundles: Vec<Bundle>,
    offers: Vec<Offer>,
    night: Vec<Offer>,
    accessories: Vec<Accessory>,
    vp: Option<u64>,
    kc: Option<u64>,
    offers_left: u64,
    bundles_left: u64,
    night_left: u64,
    accessories_left: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Bundle {
    id: String,
    price: Option<u64>,
    left: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Offer {
    id: String,
    price: Option<u64>,
    discount: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Accessory {
    id: String,
    kind: String,
    price: Option<u64>,
}

pub async fn store() -> Result<Storefront, String> {
    let lock = lock()?.ok_or_else(|| "Launch VALORANT to view your store".to_string())?;
    let auth = auth(&lock).await?;
    let subject = auth
        .token
        .subject
        .as_deref()
        .filter(|value| uuid(value))
        .unwrap_or(&auth.session.puuid);
    let url = format!(
        "https://pd.{}.a.pvp.net/store/v3/storefront/{}",
        auth.region, subject
    );
    let response = api()?
        .post(url)
        .header("Accept", "application/json")
        .header("X-Riot-ClientPlatform", PLATFORM)
        .header("X-Riot-ClientVersion", &auth.version)
        .header("X-Riot-Entitlements-JWT", &auth.token.token)
        .bearer_auth(&auth.token.access_token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|error| issue("Store request failed", error))?;
    let data: Value = if response.status().is_success() {
        response
            .json()
            .await
            .map_err(|_| "Store returned invalid data".to_string())?
    } else {
        let status = response.status();
        let body: Value = response.json().await.unwrap_or(Value::Null);
        let code = text(get_ci(Some(&body), "errorCode")).unwrap_or("unknown error");
        let fallback = format!(
            "https://pd.{}.a.pvp.net/store/v2/storefront/{}",
            auth.shard, subject
        );
        get(&fallback, &auth.token, &auth.version)
            .await
            .map_err(|error| format!("Store unavailable (HTTP {status}, {code}; v2: {error})"))?
    };
    let panel = data.get("SkinsPanelLayout");
    let listed = panel
        .and_then(|value| value.get("SingleItemStoreOffers"))
        .and_then(Value::as_array);
    let offers = panel
        .and_then(|value| value.get("SingleItemOffers"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let id = item.as_str()?.to_string();
                    let price = listed.and_then(|offers| {
                        offers.iter().find_map(|offer| {
                            (offer.get("OfferID")?.as_str()? == id)
                                .then(|| offer.get("Cost")?.get(VP)?.as_u64())
                                .flatten()
                        })
                    });
                    Some(Offer {
                        id,
                        price,
                        discount: None,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let featured = data.get("FeaturedBundle");
    let mut bundles = Vec::new();
    if let Some(bundle) = featured.and_then(|value| value.get("Bundle"))
        && let Some(bundle) = parse_bundle(bundle)
    {
        bundles.push(bundle);
    }
    if let Some(extra) = featured
        .and_then(|value| value.get("Bundles"))
        .and_then(Value::as_array)
    {
        for bundle in extra {
            if let Some(bundle) = parse_bundle(bundle)
                && !bundles.iter().any(|old: &Bundle| old.id == bundle.id)
            {
                bundles.push(bundle);
            }
        }
    }
    let bonus = data.get("BonusStore");
    let night = bonus
        .and_then(|value| value.get("BonusStoreOffers"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let offer = item.get("Offer")?;
                    Some(Offer {
                        id: offer.get("OfferID")?.as_str()?.to_string(),
                        price: item
                            .get("DiscountCosts")
                            .and_then(|cost| cost.get(VP))
                            .and_then(Value::as_u64),
                        discount: item.get("DiscountPercent").and_then(Value::as_u64),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let accessory_store = data.get("AccessoryStore");
    let accessories = accessory_store
        .and_then(|value| value.get("AccessoryStoreOffers"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let offer = item.get("Offer")?;
                    let reward = offer.get("Rewards")?.as_array()?.first()?;
                    Some(Accessory {
                        id: reward.get("ItemID")?.as_str()?.to_string(),
                        kind: reward.get("ItemTypeID")?.as_str()?.to_string(),
                        price: offer
                            .get("Cost")
                            .and_then(|cost| cost.get(KC))
                            .and_then(Value::as_u64),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let wallet_url = format!(
        "https://pd.{}.a.pvp.net/store/v1/wallet/{}",
        auth.shard, subject
    );
    let wallet: Option<Value> = get(&wallet_url, &auth.token, &auth.version).await.ok();
    let balances = wallet.as_ref().and_then(|value| value.get("Balances"));

    Ok(Storefront {
        bundles,
        offers,
        night,
        accessories,
        vp: balances
            .and_then(|value| value.get(VP))
            .and_then(Value::as_u64),
        kc: balances
            .and_then(|value| value.get(KC))
            .and_then(Value::as_u64),
        offers_left: panel
            .and_then(|value| value.get("SingleItemOffersRemainingDurationInSeconds"))
            .and_then(Value::as_u64)
            .unwrap_or(0),
        bundles_left: featured
            .and_then(|value| value.get("BundleRemainingDurationInSeconds"))
            .and_then(Value::as_u64)
            .unwrap_or(0),
        night_left: bonus
            .and_then(|value| value.get("BonusStoreRemainingDurationInSeconds"))
            .and_then(Value::as_u64)
            .unwrap_or(0),
        accessories_left: accessory_store
            .and_then(|value| value.get("AccessoryStoreRemainingDurationInSeconds"))
            .and_then(Value::as_u64)
            .unwrap_or(0),
    })
}

fn parse_bundle(value: &Value) -> Option<Bundle> {
    Some(Bundle {
        id: value.get("DataAssetID")?.as_str()?.to_string(),
        price: value
            .get("TotalDiscountedCost")
            .and_then(|cost| cost.get(VP))
            .or_else(|| value.get("TotalBaseCost").and_then(|cost| cost.get(VP)))
            .and_then(Value::as_u64),
        left: value
            .get("DurationRemainingInSeconds")
            .and_then(Value::as_u64)
            .unwrap_or(0),
    })
}
