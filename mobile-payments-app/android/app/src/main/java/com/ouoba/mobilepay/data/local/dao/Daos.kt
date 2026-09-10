package com.ouoba.mobilepay.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.ouoba.mobilepay.data.local.entity.MerchantEntity
import com.ouoba.mobilepay.data.local.entity.ServiceEntity
import com.ouoba.mobilepay.data.local.entity.UserProfileEntity

@Dao
interface ServiceDao {
    @Query("SELECT DISTINCT operator FROM services ORDER BY operator")
    suspend fun getOperators(): List<String>

    @Query("SELECT * FROM services WHERE operator = :operator ORDER BY name")
    suspend fun getServicesForOperator(operator: String): List<ServiceEntity>

    @Query("SELECT COUNT(*) FROM services")
    suspend fun count(): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(services: List<ServiceEntity>)
}

@Dao
interface MerchantDao {
    @Query("SELECT * FROM merchants WHERE operator = :operator AND code = :code LIMIT 1")
    suspend fun find(operator: String, code: String): MerchantEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(merchant: MerchantEntity)

    /** Marchands créés (ou modifiés) hors-ligne, pas encore confirmés par le backend. */
    @Query("SELECT * FROM merchants WHERE synced = 0")
    suspend fun getUnsynced(): List<MerchantEntity>

    @Update
    suspend fun update(merchant: MerchantEntity)
}

@Dao
interface UserProfileDao {
    @Query("SELECT * FROM user_profile WHERE id = 0 LIMIT 1")
    suspend fun get(): UserProfileEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(profile: UserProfileEntity)

    @Query("UPDATE user_profile SET synced = :synced WHERE id = 0")
    suspend fun setSynced(synced: Boolean)
}
