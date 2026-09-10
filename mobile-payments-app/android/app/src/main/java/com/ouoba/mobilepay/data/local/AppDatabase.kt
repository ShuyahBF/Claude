package com.ouoba.mobilepay.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.ouoba.mobilepay.data.local.dao.MerchantDao
import com.ouoba.mobilepay.data.local.dao.ServiceDao
import com.ouoba.mobilepay.data.local.dao.UserProfileDao
import com.ouoba.mobilepay.data.local.entity.MerchantEntity
import com.ouoba.mobilepay.data.local.entity.ServiceEntity
import com.ouoba.mobilepay.data.local.entity.UserProfileEntity

/**
 * Base locale (SQLite via Room) : c'est elle la source de vérité pour l'interface, jamais
 * le réseau directement. Le réseau ne sert qu'à rafraîchir/synchroniser cette base quand
 * une connexion existe — son absence ne doit jamais bloquer l'utilisateur (zones rurales).
 */
@Database(
    entities = [ServiceEntity::class, MerchantEntity::class, UserProfileEntity::class],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun serviceDao(): ServiceDao
    abstract fun merchantDao(): MerchantDao
    abstract fun userProfileDao(): UserProfileDao

    companion object {
        @Volatile private var instance: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "mobilepay.db"
                ).build().also { instance = it }
            }
    }
}
