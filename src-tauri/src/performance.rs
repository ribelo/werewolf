/// Performance optimizations for large competitions
/// 
/// This module provides performance enhancements for competitions with many competitors:
/// - Pagination support for large result sets
/// - Query result caching
/// - Connection pooling optimization
/// - Query batching for bulk operations

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH, Duration};

/// Default page size for paginated queries
pub const DEFAULT_PAGE_SIZE: i32 = 50;
pub const MAX_PAGE_SIZE: i32 = 500;

/// Cache entry with expiration
#[derive(Clone, Debug)]
struct CacheEntry<T> {
    data: T,
    expires_at: u64,
}

/// Simple in-memory cache for query results
#[derive(Debug)]
pub struct QueryCache<T> {
    entries: Arc<RwLock<HashMap<String, CacheEntry<T>>>>,
    ttl_seconds: u64,
}

impl<T: Clone> QueryCache<T> {
    pub fn new(ttl_seconds: u64) -> Self {
        Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
            ttl_seconds,
        }
    }

    pub async fn get(&self, key: &str) -> Option<T> {
        let entries = self.entries.read().await;
        let current_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()?
            .as_secs();

        if let Some(entry) = entries.get(key) {
            if entry.expires_at > current_time {
                return Some(entry.data.clone());
            }
        }
        None
    }

    pub async fn set(&self, key: String, data: T) {
        let expires_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() + self.ttl_seconds)
            .unwrap_or(0);

        let mut entries = self.entries.write().await;
        entries.insert(key, CacheEntry { data, expires_at });
    }

    pub async fn invalidate(&self, key: &str) {
        let mut entries = self.entries.write().await;
        entries.remove(key);
    }

    pub async fn invalidate_prefix(&self, prefix: &str) {
        let mut entries = self.entries.write().await;
        entries.retain(|k, _| !k.starts_with(prefix));
    }

    /// Clean up expired entries
    pub async fn cleanup_expired(&self) {
        let current_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let mut entries = self.entries.write().await;
        entries.retain(|_, entry| entry.expires_at > current_time);
    }
}

/// Pagination parameters for queries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationParams {
    pub page: i32,      // 1-based page number
    pub page_size: i32, // Number of items per page
}

impl Default for PaginationParams {
    fn default() -> Self {
        Self {
            page: 1,
            page_size: DEFAULT_PAGE_SIZE,
        }
    }
}

impl PaginationParams {
    pub fn new(page: i32, page_size: i32) -> Self {
        Self {
            page: page.max(1),
            page_size: page_size.clamp(1, MAX_PAGE_SIZE),
        }
    }

    pub fn offset(&self) -> i32 {
        (self.page - 1) * self.page_size
    }

    pub fn limit(&self) -> i32 {
        self.page_size
    }
}

/// Paginated result wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedResult<T> {
    pub items: Vec<T>,
    pub page: i32,
    pub page_size: i32,
    pub total_items: i32,
    pub total_pages: i32,
    pub has_next: bool,
    pub has_previous: bool,
}

impl<T> PaginatedResult<T> {
    pub fn new(items: Vec<T>, page: i32, page_size: i32, total_items: i32) -> Self {
        let total_pages = (total_items + page_size - 1) / page_size; // Ceiling division
        Self {
            items,
            page,
            page_size,
            total_items,
            total_pages,
            has_next: page < total_pages,
            has_previous: page > 1,
        }
    }
}

/// Database connection pool optimization settings
#[derive(Debug, Clone)]
pub struct PoolSettings {
    pub max_connections: u32,
    pub min_connections: u32,
    pub acquire_timeout: Duration,
    pub idle_timeout: Duration,
}

impl Default for PoolSettings {
    fn default() -> Self {
        Self {
            max_connections: 10,
            min_connections: 2,
            acquire_timeout: Duration::from_secs(10),
            idle_timeout: Duration::from_secs(300), // 5 minutes
        }
    }
}

impl PoolSettings {
    /// Optimized settings for large competitions
    pub fn for_large_competition() -> Self {
        Self {
            max_connections: 25,
            min_connections: 5,
            acquire_timeout: Duration::from_secs(5),
            idle_timeout: Duration::from_secs(600), // 10 minutes
        }
    }

    /// Settings for small competitions
    pub fn for_small_competition() -> Self {
        Self {
            max_connections: 5,
            min_connections: 1,
            acquire_timeout: Duration::from_secs(15),
            idle_timeout: Duration::from_secs(180), // 3 minutes
        }
    }
}

/// Batch operation helper for bulk database operations
pub struct BatchOperator {
    batch_size: usize,
}

impl BatchOperator {
    pub fn new(batch_size: usize) -> Self {
        Self {
            batch_size: batch_size.max(1).min(1000), // Clamp between 1 and 1000
        }
    }

    /// Process items in batches
    pub async fn process_batched<T, F, Fut, R>(
        &self,
        items: Vec<T>,
        processor: F,
    ) -> Result<Vec<R>, Box<dyn std::error::Error + Send + Sync>>
    where
        F: Fn(Vec<T>) -> Fut + Send + Sync,
        Fut: std::future::Future<Output = Result<Vec<R>, Box<dyn std::error::Error + Send + Sync>>> + Send,
        T: Send,
        R: Send,
    {
        let mut results = Vec::new();
        
        for chunk in items.chunks(self.batch_size) {
            let batch_result = processor(chunk.to_vec()).await?;
            results.extend(batch_result);
        }
        
        Ok(results)
    }
}

/// Performance monitoring helpers
pub struct PerformanceMonitor {
    operation_times: Arc<RwLock<HashMap<String, Vec<Duration>>>>,
}

impl PerformanceMonitor {
    pub fn new() -> Self {
        Self {
            operation_times: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn time_operation<F, Fut, T>(&self, operation_name: &str, operation: F) -> T
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = T>,
    {
        let start = SystemTime::now();
        let result = operation().await;
        let duration = start.elapsed().unwrap_or_default();

        let mut times = self.operation_times.write().await;
        times.entry(operation_name.to_string()).or_insert_with(Vec::new).push(duration);

        result
    }

    pub async fn get_average_time(&self, operation_name: &str) -> Option<Duration> {
        let times = self.operation_times.read().await;
        let durations = times.get(operation_name)?;
        
        if durations.is_empty() {
            return None;
        }

        let total_nanos: u64 = durations.iter().map(|d| d.as_nanos() as u64).sum();
        let avg_nanos = total_nanos / durations.len() as u64;
        Some(Duration::from_nanos(avg_nanos))
    }

    pub async fn get_stats(&self, operation_name: &str) -> Option<PerformanceStats> {
        let times = self.operation_times.read().await;
        let durations = times.get(operation_name)?;
        
        if durations.is_empty() {
            return None;
        }

        let total_nanos: u64 = durations.iter().map(|d| d.as_nanos() as u64).sum();
        let count = durations.len();
        let avg_nanos = total_nanos / count as u64;
        
        let mut sorted = durations.clone();
        sorted.sort();
        
        let min_duration = *sorted.first().unwrap();
        let max_duration = *sorted.last().unwrap();
        let median_duration = if count % 2 == 0 {
            let mid1 = sorted[count / 2 - 1];
            let mid2 = sorted[count / 2];
            Duration::from_nanos((mid1.as_nanos() + mid2.as_nanos()) as u64 / 2)
        } else {
            sorted[count / 2]
        };

        Some(PerformanceStats {
            operation_name: operation_name.to_string(),
            count,
            average: Duration::from_nanos(avg_nanos),
            min: min_duration,
            max: max_duration,
            median: median_duration,
        })
    }
}

#[derive(Debug, Clone)]
pub struct PerformanceStats {
    pub operation_name: String,
    pub count: usize,
    pub average: Duration,
    pub min: Duration,
    pub max: Duration,
    pub median: Duration,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::sleep;

    #[tokio::test]
    async fn test_query_cache() {
        let cache = QueryCache::<String>::new(1); // 1 second TTL
        
        // Test set and get
        cache.set("key1".to_string(), "value1".to_string()).await;
        assert_eq!(cache.get("key1").await, Some("value1".to_string()));
        
        // Test expiration
        sleep(Duration::from_millis(1100)).await;
        assert_eq!(cache.get("key1").await, None);
    }

    #[tokio::test]
    async fn test_pagination_params() {
        let params = PaginationParams::new(2, 25);
        assert_eq!(params.page, 2);
        assert_eq!(params.page_size, 25);
        assert_eq!(params.offset(), 25);
        assert_eq!(params.limit(), 25);
    }

    #[tokio::test]
    async fn test_paginated_result() {
        let items = vec!["a", "b", "c"];
        let result = PaginatedResult::new(items, 1, 10, 23);
        
        assert_eq!(result.total_pages, 3);
        assert!(!result.has_previous);
        assert!(result.has_next);
    }

    #[tokio::test]
    async fn test_performance_monitor() {
        let monitor = PerformanceMonitor::new();
        
        monitor.time_operation("test_op", || async {
            sleep(Duration::from_millis(10)).await;
            "result"
        }).await;
        
        let avg = monitor.get_average_time("test_op").await.unwrap();
        assert!(avg >= Duration::from_millis(10));
    }
}