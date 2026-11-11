use super::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mission {
    id: String,
    objectives: HashMap<String, u32>,
    complete: bool,
}

pub async fn missions() -> Result<Vec<Mission>, String> {
    let lock = lock()?.ok_or_else(|| "Riot Client is not running".to_string())?;
    let auth = auth(&lock).await?;
    let url = format!(
        "https://pd.{}.a.pvp.net/contracts/v1/contracts/{}",
        auth.shard, auth.session.puuid
    );
    let value: Value = get(&url, &auth.token, &auth.version).await?;
    let rows = get_ci(Some(&value), "Missions")
        .and_then(Value::as_array)
        .ok_or_else(|| "Riot returned an invalid mission list".to_string())?;
    Ok(rows
        .iter()
        .filter_map(|row| {
            let id = text(get_ci(Some(row), "ID"))?.to_string();
            let objectives = get_ci(Some(row), "Objectives")
                .and_then(Value::as_object)
                .map(|values| {
                    values
                        .iter()
                        .filter_map(|(id, value)| num(Some(value)).map(|count| (id.clone(), count)))
                        .collect()
                })
                .unwrap_or_default();
            Some(Mission {
                id,
                objectives,
                complete: get_ci(Some(row), "Complete")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            })
        })
        .collect())
}
